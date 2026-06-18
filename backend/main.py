# main.py - FastAPI Backend for Shelby AI Trust Companion
import os
import time
import uuid
import urllib.parse
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
VIRUSTOTAL_API_KEY = os.getenv("VIRUSTOTAL_API_KEY")

app = FastAPI(title="Shelby AI Backend")

# Enable CORS for Chrome Extension origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global caches (In-memory)
scanned_contexts: Dict[str, str] = {}
vt_cache: Dict[str, Dict[str, Any]] = {}

class ScanRequest(BaseModel):
    url: str
    mode: str
    scraped_text: str
    selected_text: Optional[str] = None

class AskRequest(BaseModel):
    scan_id: str
    question: str

class Subscores(BaseModel):
    security: int
    reputation: int
    content_quality: int
    privacy: int

class ScanResponse(BaseModel):
    scan_id: str
    trust_score: int
    confidence: str
    risk_category: str
    subscores: Subscores
    verdicts: Dict[str, str]
    findings: List[str]
    reasons_why: List[str]
    shelby_says: str
    sparkline_data: Optional[List[int]] = None
    ai_analyzed: bool
    scan_time_ms: int

class AskResponse(BaseModel):
    answer: str

# Local Check Heuristics
def run_local_heuristics(url: str, domain: str) -> Dict[str, Any]:
    is_https = url.startswith("https://")
    
    # Common suspicious keywords in domains
    scam_keywords = ["secure", "update", "login", "verify", "account", "bank", "gift", "free", "reward", "prize", "support", "claim"]
    matched_keywords = [kw for kw in scam_keywords if kw in domain.lower()]
    
    # Suspicious TLD flags
    suspicious_tlds = [".xyz", ".top", ".click", ".win", ".loan", ".club", ".info", ".temp"]
    has_suspicious_tld = any(domain.lower().endswith(tld) for tld in suspicious_tlds)
    
    estimated_risk = "LOW"
    if not is_https or len(matched_keywords) > 0:
      estimated_risk = "HIGH"
    elif has_suspicious_tld:
      estimated_risk = "MEDIUM"
      
    return {
        "is_https": is_https,
        "matched_keywords": matched_keywords,
        "has_suspicious_tld": has_suspicious_tld,
        "ssl_status": "Secure SSL" if is_https else "Insecure Connection",
        "estimated_risk": estimated_risk
    }

# VirusTotal Reputation Scan with Caching
async def fetch_virustotal_report(domain: str) -> Dict[str, Any]:
    # Check cache first
    if domain in vt_cache:
        cached_entry = vt_cache[domain]
        # 24 hours in seconds: 24 * 3600 = 86400
        if time.time() - cached_entry["timestamp"] < 86400:
            print(f"VT Cache HIT for domain: {domain}")
            return cached_entry["report"]
        else:
            print(f"VT Cache EXPIRED for domain: {domain}")
        
    if not VIRUSTOTAL_API_KEY:
        return {"malicious": 0, "suspicious": 0, "status": "UNKNOWN"}
        
    url = f"https://www.virustotal.com/api/v3/domains/{domain}"
    headers = {"x-apikey": VIRUSTOTAL_API_KEY}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
                malicious = stats.get("malicious", 0)
                suspicious = stats.get("suspicious", 0)
                
                status = "SAFE"
                if malicious > 3:
                    status = "MALICIOUS"
                elif malicious > 0 or suspicious > 1:
                    status = "SUSPICIOUS"
                    
                report = {
                    "malicious": malicious,
                    "suspicious": suspicious,
                    "status": status
                }
                
                # Store in cache with current timestamp
                vt_cache[domain] = {
                    "timestamp": time.time(),
                    "report": report
                }
                return report
        except Exception as e:
            print(f"VirusTotal fetch error: {e}")
            
    return {"malicious": 0, "suspicious": 0, "status": "UNKNOWN"}

# Gemini Deep Analysis
async def call_gemini_analysis(
    mode: str, 
    url: str, 
    scraped_text: str, 
    selected_text: Optional[str], 
    local_checks: Dict[str, Any], 
    vt_report: Dict[str, Any]
) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        raise Exception("Gemini API key is missing on the server.")
        
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    cropped_text = scraped_text[:5000]
    is_text_highlight = selected_text is not None and len(selected_text.strip()) > 0
    
    system_prompt = """You are Shelby, a cute, warm, friendly AI companion that helps users determine whether they can trust what they are seeing on the internet. 
You speak like a smart, warm friend, never like a security tool. You use simple language with no technical jargon ever.
Always end your explanation (the 'shelby_says' field) with a clear action. Keep the explanation under 3 sentences maximum.

Your response must be a single JSON object strictly matching the schema below.
Do not wrap the JSON output in markdown tags. Output the raw JSON string directly.

SCHEMA:
{
  "content_quality": 0-100 (qualitative content integrity score),
  "privacy": 0-100 (qualitative cookie / permission / tracker safety score),
  "reputation_sentiment": 0-20 (reputation sentiment: 20=highly positive/legit, 10=neutral/mixed, 0=scam/malicious),
  "verdicts": { "general": "SAFE" | "SUSPICIOUS" | "MALICIOUS" },
  "findings": ["Point 1", "Point 2"],
  "reasons_why": ["+ Explaining a positive factor", "- Explaining a negative factor"],
  "shelby_says": "Shelby friendly explanation...",
  "sparkline_data": [10, 20, 30] (Only return if Shopping Mode - price history simulation for sparkline)
}

CRITICAL RULES FOR "reasons_why":
- Return exactly 3-5 short points.
- Every point MUST start with a '+' if it is a positive trust indicator (e.g. "+ Safe text characteristics", "+ No phishing indicators found").
- Every point MUST start with a '-' if it is a negative warning indicator (e.g. "- Review quality is suspicious", "- Too many advertising trackers").
- NEVER omit the leading '+' or '-'.
"""

    if is_text_highlight:
        prompt = f"""AUDIT REQUEST: Highlighted Text Analysis (Scam Mode)
URL where highlighted: {url}
Highlighted Text:
\"\"\"
{selected_text}
\"\"\"
Local page metadata: {local_checks}
VirusTotal Domain Status: {vt_report}

Evaluate the highlighted text for scam probability, threat language, urgency indicators, and fake rewards. Return content_quality, privacy, reputation_sentiment (0-20), findings, reasons_why (prefixed with '+' or '-'), and Shelby Says advice."""
    else:
        prompt = f"""AUDIT REQUEST: Full Page Website Scan
URL: {url}
Mode: {mode} (If Wikipedia or News site, evaluate as Content Intelligence Mode)
Local Page Metadata: {local_checks}
VirusTotal Domain Status: {vt_report}
Page Scraped Text:
\"\"\"
{cropped_text}
\"\"\"

Evaluate the page structure based on the mode.
- Trust Mode: General website checks.
- Shopping Mode: Reviews, pricing, and fake discount tricks. Add simulated 6-month 'sparkline_data' (list of integers matching history prices).
- Content Intelligence Mode: Audit page content for clickbait titles, emotional manipulation triggers, AI-generated text styles, and source reliability.
Return content_quality, privacy, reputation_sentiment (0-20), findings, reasons_why (prefixed with '+' or '-'), verdicts, and Shelby Says advice."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"}, timeout=15.0)
        if response.status_code != 200:
            raise Exception(f"Gemini API error: {response.text}")
            
        result = response.json()
        try:
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            import json
            return json.loads(text)
        except Exception as e:
            raise Exception("Gemini returned invalid JSON format.")

@app.post("/api/scan", response_model=ScanResponse)
async def scan_website(request: ScanRequest):
    start_time = time.perf_counter()
    try:
        parsed_url = urllib.parse.urlparse(request.url)
        domain = parsed_url.hostname or ""
        
        # Create a unique scan_id to cache context
        scan_id = str(uuid.uuid4())
        scanned_contexts[scan_id] = request.selected_text if request.selected_text else request.scraped_text
        
        # 1. Local checks (0ms)
        local_checks = run_local_heuristics(request.url, domain)
        is_https = local_checks["is_https"]
        has_tld_threat = local_checks["has_suspicious_tld"]
        has_keyword_threat = len(local_checks["matched_keywords"]) > 0
        risk_rating = local_checks["estimated_risk"]
        
        # 2. VirusTotal domain check
        vt_report = await fetch_virustotal_report(domain)
        vt_status = vt_report["status"]
        
        # 3. Deterministic rules-based subscores:
        # Security: HTTPS (+30) + Safe TLD (+20) + VT Clean (+35) + SSL secure (+15)
        security_score = 0
        if is_https:
            security_score += 45
        if not has_tld_threat and not has_keyword_threat:
            security_score += 20
        if vt_status == "SAFE":
            security_score += 35
        elif vt_status == "SUSPICIOUS":
            security_score += 15
            
        # Reputation: VT Safe (+50), Local risk LOW (+30), Gemini sentiment (+20)
        reputation_score = 0
        if vt_status == "SAFE":
            reputation_score += 50
        elif vt_status == "SUSPICIOUS":
            reputation_score += 20
        if risk_rating == "LOW":
            reputation_score += 30
        elif risk_rating == "MEDIUM":
            reputation_score += 15
        
        security_score = max(0, min(100, security_score))
        reputation_score = max(0, min(100, reputation_score))
        
        # 4. Attempt Gemini Call (Hybrid Content/Privacy audit)
        ai_analyzed = True
        gemini_sentiment = 15
        content_quality = 50
        privacy = 50
        sparkline_data = None
        reasons_why = []
        shelby_says = ""
        verdicts = {"general": "SUSPICIOUS"}
        findings = []
        
        try:
            gemini_data = await call_gemini_analysis(
                mode=request.mode,
                url=request.url,
                scraped_text=request.scraped_text,
                selected_text=request.selected_text,
                local_checks=local_checks,
                vt_report=vt_report
            )
            
            # Read subscores from Gemini
            content_quality = max(0, min(100, gemini_data.get("content_quality", 50)))
            privacy = max(0, min(100, gemini_data.get("privacy", 50)))
            gemini_sentiment = gemini_data.get("reputation_sentiment", 15)
            reasons_why = gemini_data.get("reasons_why", [])
            shelby_says = gemini_data.get("shelby_says", "")
            verdicts = gemini_data.get("verdicts", {"general": "SUSPICIOUS"})
            findings = gemini_data.get("findings", [])
            sparkline_data = gemini_data.get("sparkline_data")
            
            # Incorporate Gemini sentiment into reputation subscore
            reputation_score = max(0, min(100, reputation_score + int(gemini_sentiment)))
            
        except Exception as api_err:
            # Step 5: Offline/Failure Fallback (Security Only assessment)
            print(f"Gemini API request failed, entering offline fallback: {api_err}")
            ai_analyzed = False
            content_quality = 0
            privacy = 0
            shelby_says = "AI Analysis unavailable. Showing security-only assessment."
            verdicts = {"general": "SAFE" if security_score > 70 else "SUSPICIOUS"}
            findings = ["Security-only scan performed", "Gemini API fallback activated"]
            
            # Local-only explanation list
            reasons_why = [
                "+ HTTPS active" if is_https else "- Insecure HTTP connection",
                "+ No malicious keywords in domain" if not has_keyword_threat else "- Suspect keywords in hostname",
                "+ Standard TLD registered" if not has_tld_threat else "- Threat-linked domain extension",
            ]
            if vt_status != "UNKNOWN":
                status_icon = "+" if vt_status == "SAFE" else "-"
                reasons_why.append(f"{status_icon} VirusTotal status: {vt_status}")
        
        # 6. Final Trust Score Formula:
        if ai_analyzed:
            # Trust Score = 40% Security + 25% Reputation + 20% Content Quality + 15% Privacy
            calculated_score = round(
                security_score * 0.40 + 
                reputation_score * 0.25 + 
                content_quality * 0.20 + 
                privacy * 0.15
            )
        else:
            # Fallback Trust Score: 60% Security + 40% Reputation
            calculated_score = round(
                security_score * 0.60 + 
                reputation_score * 0.40
            )
            
        # Determine explicit risk category
        # 80-100: Safe, 60-79: Caution, 40-59: Risky, 0-39: Dangerous
        if calculated_score >= 80:
            risk_category = "Safe"
        elif calculated_score >= 60:
            risk_category = "Caution"
        elif calculated_score >= 40:
            risk_category = "Risky"
        else:
            risk_category = "Dangerous"
            
        # 7. Confidence Rating Heuristics
        text_length = len(request.selected_text) if request.selected_text else len(request.scraped_text)
        confidence = "High"
        if not ai_analyzed:
            confidence = "Low"
        elif text_length < 400 or vt_report["status"] == "UNKNOWN":
            confidence = "Medium"
        elif text_length < 100:
            confidence = "Low"
            
        scan_time_ms = int((time.perf_counter() - start_time) * 1000)
        
        return {
            "scan_id": scan_id,
            "trust_score": calculated_score,
            "confidence": confidence,
            "risk_category": risk_category,
            "subscores": {
                "security": security_score,
                "reputation": reputation_score,
                "content_quality": content_quality,
                "privacy": privacy,
            },
            "verdicts": verdicts,
            "findings": findings,
            "reasons_why": reasons_why,
            "shelby_says": shelby_says,
            "sparkline_data": sparkline_data,
            "ai_analyzed": ai_analyzed,
            "scan_time_ms": scan_time_ms
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ask", response_model=AskResponse)
async def ask_shelby(request: AskRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key is missing on the server.")
        
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    # Retrieve context from local UUID scanned cache
    page_context = scanned_contexts.get(request.scan_id, "No page text context available.")
    
    system_prompt = """You are Shelby, a cute, warm, friendly AI companion. 
Answer the user's question about the webpage content in Shelby's friendly, cute mascot voice.
Speak directly to the user as a helpful, smart friend. Avoid technical jargon or security report formatting.
Keep your response simple and under 3 sentences max, ending with a warm recommendation."""

    user_prompt = f"""Webpage Context:
Scraped Page Text:
\"\"\"
{page_context[:4000]}
\"\"\"

User's Question:
{request.question}

Please answer the user's question directly and warmly based on the page context."""

    payload = {
        "contents": [{"parts": [{"text": user_prompt}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1000
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"}, timeout=15.0)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Gemini API error: {response.text}")
            
            result = response.json()
            answer = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            return {"answer": answer}
        except Exception as e:
            return {"answer": "Oh dear! My AI gears got stuck while thinking about that. Try asking again, or check the security score metrics! 💖"}
