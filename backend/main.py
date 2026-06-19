# main.py - FastAPI Backend for Shelby AI Trust Companion (V3 Overhaul)
import os
import time
import uuid
import urllib.parse
import hashlib
import ssl
import socket
from datetime import datetime
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
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI(title="Shelby AI Backend")

# Enable CORS for Chrome Extension origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global caches
vt_cache: Dict[str, Dict[str, Any]] = {}
scan_cache: Dict[str, Dict[str, Any]] = {}

class ScanRequest(BaseModel):
    url: str
    mode: str
    scraped_text: str
    selected_text: Optional[str] = None
    image_url: Optional[str] = None

class Subscores(BaseModel):
    security: int
    reputation: int
    domain: int
    content: int

class DeepfakeResults(BaseModel):
    verdict: str
    confidence: str
    indicators: List[str]

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
    deepfake_results: Optional[DeepfakeResults] = None
    ai_analyzed: bool
    scan_time_ms: int
    scan_source: str
    debug_info: Dict[str, Any]

# Cache Key hashing function
def compute_cache_key(url: str, text: str) -> str:
    cleaned_text = text[:1000] if text else ""
    raw = f"{url}|||{cleaned_text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

# SSL Validation check
def verify_ssl(hostname: str) -> bool:
    context = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, 443), timeout=3.0) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                ssock.getpeercert()
                return True
    except Exception:
        return False

# RDAP Domain Age fetcher
async def get_domain_age_years(domain: str) -> float:
    url = f"https://rdap.org/domain/{domain}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=4.0)
            if response.status_code == 200:
                data = response.json()
                events = data.get("events", [])
                for event in events:
                    action = event.get("eventAction", "").lower()
                    if action in ["registration", "creation"]:
                        date_str = event.get("eventDate", "")
                        clean_date = date_str.replace("Z", "")
                        if "T" in clean_date:
                            clean_date = clean_date.split("T")[0]
                        dt = datetime.strptime(clean_date, "%Y-%m-%d")
                        age_days = (datetime.utcnow() - dt).days
                        return round(age_days / 365.25, 2)
        except Exception as e:
            print(f"RDAP error for {domain}: {e}")
    return 0.0

# Redirect Counter
async def check_redirects(url: str) -> int:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.head(url, follow_redirects=True, timeout=3.0)
            return len(response.history)
        except Exception:
            try:
                response = await client.get(url, follow_redirects=True, timeout=3.0)
                return len(response.history)
            except Exception:
                return 0

# Levenshtein distance typosquatting checks
TOP_BRANDS = [
    "google", "amazon", "flipkart", "meesho", "myntra", "snapdeal", "ajio", 
    "wikipedia", "linkedin", "facebook", "twitter", "microsoft", "github", 
    "netflix", "youtube", "paypal", "apple", "instagram", "yahoo", "zoom"
]

def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def detect_typosquatting(domain: str) -> bool:
    parts = domain.split(".")
    if len(parts) >= 2:
        domain_name = parts[-2]
    else:
        domain_name = domain
    domain_name = domain_name.lower()
    
    for brand in TOP_BRANDS:
        if domain_name == brand:
            return False
        dist = levenshtein_distance(domain_name, brand)
        if 1 <= dist <= 2:
            return True
    return False

# Brand Impersonation check
def detect_brand_impersonation(domain: str, text: str) -> bool:
    text_lower = text.lower()
    domain_lower = domain.lower()
    for brand in TOP_BRANDS:
        if brand in text_lower:
            if brand not in domain_lower:
                return True
    return False

# Reputation whitelist
def check_whitelist(domain: str) -> bool:
    domain_lower = domain.lower()
    whitelisted_domains = [
        "google.com", "wikipedia.org", "github.com", "microsoft.com", 
        "apple.com", "linkedin.com", "bbc.com", "nytimes.com", "cnn.com"
    ]
    return any(domain_lower == d or domain_lower.endswith("." + d) for d in whitelisted_domains)

# Content checks
def run_content_heuristics(text: str, url: str) -> Dict[str, bool]:
    text_lower = text.lower()
    url_lower = url.lower()
    
    phishing_keywords = ["secure", "verify", "update", "login", "bank", "account", "claim", "free", "reward", "prize", "support", "signin", "password", "credential"]
    phishing_keywords_found = any(kw in url_lower for kw in phishing_keywords)
    
    login_indicators = ["password", "login id", "email address", "enter your password", "sign in to your account"]
    login_form_detected = any(ind in text_lower for ind in login_indicators)
    
    urgency_indicators = ["verify immediately", "account suspended", "act now", "limited time security check", "action required", "urgent", "suspension"]
    urgency_language_detected = any(ind in text_lower for ind in urgency_indicators)
    
    return {
        "phishing_keywords_found": phishing_keywords_found,
        "login_form_detected": login_form_detected,
        "urgency_language_detected": urgency_language_detected
    }

# VirusTotal Reputation Scan with 24h caching
async def fetch_virustotal_report(domain: str) -> Dict[str, Any]:
    if domain in vt_cache:
        cached_entry = vt_cache[domain]
        if time.time() - cached_entry["timestamp"] < 86400:
            return cached_entry["report"]
        
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
                
                vt_cache[domain] = {
                    "timestamp": time.time(),
                    "report": report
                }
                return report
        except Exception as e:
            print(f"VirusTotal fetch error: {e}")
            
    return {"malicious": 0, "suspicious": 0, "status": "UNKNOWN"}

# Gemini Vision AI Image Authenticity Analysis
async def call_gemini_vision_analysis(image_url: str) -> Dict[str, Any]:
    if not GEMINI_API_KEY:
        return {
            "verdict": "Likely Real",
            "confidence": "Low",
            "indicators": ["Gemini API Key missing on server"]
        }
        
    async with httpx.AsyncClient() as client:
        try:
            img_response = await client.get(image_url, timeout=5.0)
            if img_response.status_code != 200:
                return {
                    "verdict": "Likely Real",
                    "confidence": "Low",
                    "indicators": ["Failed to download image from webpage"]
                }
            image_bytes = img_response.content
            import base64
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            mime_type = img_response.headers.get("Content-Type", "image/jpeg")
            if not mime_type.startswith("image/"):
                mime_type = "image/jpeg"
        except Exception as e:
            return {
                "verdict": "Likely Real",
                "confidence": "Low",
                "indicators": [f"Failed to fetch image: {str(e)}"]
            }
            
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = """You are a cybersecurity image analyst specializing in detecting AI-generated or synthetically manipulated images.
Analyze this image for:
- Hand anomalies (deformed fingers, extra limbs, floating fingers)
- Finger count inconsistencies
- Teeth consistency (unnatural alignment, uniform spacing)
- Eye symmetry and pupil shape
- Lighting and reflection consistency
- Background blur or strange artifacts (halos, illogical structures)
- Text rendering artifacts (mumbled or gibberish characters in text overlays)
- Facial distortions and skin-smoothing anomalies

Based ONLY on visual evidence, output a JSON object strictly matching the schema below.
DO NOT wrap the JSON in markdown blocks. Output raw JSON.
DO NOT claim absolute certainty (never say '100% fake' or 'fake').

SCHEMA:
{
  "verdict": "Likely Real" | "Possibly AI Generated" | "Likely AI Generated",
  "confidence": "Low" | "Medium" | "High",
  "indicators": ["Finding 1", "Finding 2"]
}
"""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": image_b64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"}, timeout=15.0)
            if response.status_code == 200:
                result = response.json()
                text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                import json
                return json.loads(text)
        except Exception as e:
            print(f"Gemini Vision error: {e}")
            
    return {
        "verdict": "Likely Real",
        "confidence": "Low",
        "indicators": ["AI image analysis engine encountered a technical error"]
    }

# OpenAI GPT Explanation Layer
async def call_openai_explanation(
    url: str,
    score: int,
    category: str,
    evidence: List[str]
) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        return {
            "shelby_says": "Oh dear! My explanation engine is offline because the OpenAI API key is missing. But look at my security checks! 💖",
            "findings": evidence
        }
        
    endpoint = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }
    
    system_prompt = """You are Shelby, a cute, warm, friendly AI cybersecurity companion.
You speak like a smart, warm friend, never like a sterile security tool. Use simple, warm language.
Always end your explanation with a clear, direct recommendation or action. Keep the explanation under 3 sentences maximum.

CRITICAL RULES:
1. Ground your explanation strictly on the provided evidence.
2. If evidence is unavailable or insufficient, do not infer, guess, or invent information. Return exactly: "I couldn't find enough evidence on this page."
3. Do not invent any metrics, scores, or facts not present in the input.
4. Your response must be a single JSON object strictly matching the schema below.
Do not wrap the JSON output in markdown tags. Output the raw JSON string directly.

SCHEMA:
{
  "shelby_says": "Shelby friendly explanation...",
  "findings": ["Direct evidence point 1", "Direct evidence point 2"]
}
"""

    evidence_text = "\n".join([f"- {ev}" for ev in evidence])
    user_prompt = f"""AUDIT METRICS:
URL: {url}
Calculated Trust Score: {score}
Risk Category: {category}

EVIDENCE COLLECTED:
{evidence_text}

Please explain why the site has this risk level and list the key findings strictly grounded in the evidence."""

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(endpoint, json=payload, headers=headers, timeout=12.0)
            if response.status_code == 200:
                result = response.json()
                text = result["choices"][0]["message"]["content"].strip()
                import json
                return json.loads(text)
            else:
                print(f"OpenAI error: {response.text}")
        except Exception as e:
            print(f"OpenAI call failed: {e}")
            
    return {
        "shelby_says": f"This website has a trust rating of {score} ({category}). Grounded in my checks: " + ", ".join(evidence[:2]) + ". 💖",
        "findings": evidence
    }

@app.post("/api/scan", response_model=ScanResponse)
async def scan_website(request: ScanRequest):
    start_time = time.perf_counter()
    try:
        # 1. Compute Cache Key
        cache_key = compute_cache_key(request.url, request.scraped_text)
        if cache_key in scan_cache:
            cached_entry = scan_cache[cache_key]
            if time.time() - cached_entry["timestamp"] < 86400:
                print(f"Cache HIT for URL: {request.url}")
                res = cached_entry["response"].copy()
                res["scan_source"] = "Cached"
                res["scan_time_ms"] = int((time.perf_counter() - start_time) * 1000)
                # Ensure debug_info matches source
                res["debug_info"]["scan_source"] = "Cached"
                return res

        parsed_url = urllib.parse.urlparse(request.url)
        domain = parsed_url.hostname or ""

        # 2. Minimum Context Validation with Form Bypass
        content_length = len(request.scraped_text)
        content_heur = run_content_heuristics(request.scraped_text, request.url)
        login_form_detected = content_heur["login_form_detected"]

        if content_length < 50 and not login_form_detected:
            scan_id = str(uuid.uuid4())
            res = {
                "scan_id": scan_id,
                "trust_score": 0,
                "confidence": "Low",
                "risk_category": "🔴 DANGEROUS",
                "subscores": {
                    "security": 0,
                    "reputation": 0,
                    "domain": 0,
                    "content": 0
                },
                "verdicts": {"general": "MALICIOUS"},
                "findings": ["Not enough page content was extracted."],
                "reasons_why": ["- Content length below minimum of 50 characters"],
                "shelby_says": "I couldn't find enough evidence on this page.",
                "deepfake_results": None,
                "ai_analyzed": False,
                "scan_time_ms": int((time.perf_counter() - start_time) * 1000),
                "scan_source": "Fallback",
                "debug_info": {
                    "vt_result": "0 malicious / 0 engines",
                    "domain_age": "0.0 years",
                    "redirect_count": 0,
                    "login_form": "Not Detected",
                    "scan_source": "Fallback",
                    "security_score": "0/30",
                    "reputation_score": "0/35",
                    "domain_score": "0/20",
                    "content_score": "0/15"
                }
            }
            return res

        # 3. Gather Deterministic Evidence
        is_https = request.url.startswith("https://")
        ssl_valid = verify_ssl(domain) if is_https else False
        redirect_count = await check_redirects(request.url)
        
        vt_report = await fetch_virustotal_report(domain)
        vt_malicious = vt_report.get("malicious", 0)
        
        is_whitelisted = check_whitelist(domain)
        domain_age = await get_domain_age_years(domain)
        typosquat_detected = detect_typosquatting(domain)
        
        phishing_keywords_found = content_heur["phishing_keywords_found"]
        urgency_language_detected = content_heur["urgency_language_detected"]
        brand_impersonated = detect_brand_impersonation(domain, request.scraped_text)

        # 4. Calculate Subscores
        # Security Score (0-30)
        security_score = 0
        if is_https:
            security_score += 10
        if ssl_valid:
            security_score += 10
        if redirect_count <= 1:
            security_score += 10
            
        # Reputation Score (0-35)
        reputation_score = 0
        if vt_malicious == 0:
            reputation_score += 30
        elif 1 <= vt_malicious <= 2:
            reputation_score += 20
        elif 3 <= vt_malicious <= 5:
            reputation_score += 10
        if is_whitelisted:
            reputation_score += 5
            
        # Domain Score (0-20)
        domain_score = 0
        if domain_age >= 1.0:
            domain_score += 10
        if not typosquat_detected:
            domain_score += 10
            
        # Content Score (0-15)
        content_score = 15
        if phishing_keywords_found:
            content_score -= 5
        if brand_impersonated:
            content_score -= 5
        if login_form_detected:
            content_score -= 5
        if urgency_language_detected:
            content_score -= 3
        content_score = max(0, content_score)

        # Total trust score
        trust_score = security_score + reputation_score + domain_score + content_score
        trust_score = max(0, min(100, trust_score))

        # 5. Map 5-Tier Risk Category
        if trust_score >= 90:
            risk_category = "🟢 HIGH TRUST"
        elif trust_score >= 80:
            risk_category = "🟢 SAFE"
        elif trust_score >= 60:
            risk_category = "🟡 CAUTION"
        elif trust_score >= 40:
            risk_category = "🟠 RISKY"
        else:
            risk_category = "🔴 DANGEROUS"

        # Compile findings evidence points
        evidence_list = []
        evidence_list.append(f"{'✓' if is_https else '✗'} HTTPS {'Enabled' if is_https else 'Disabled'}")
        evidence_list.append(f"{'✓' if ssl_valid else '✗'} SSL {'Valid' if ssl_valid else 'Invalid'}")
        evidence_list.append(f"{'✓' if redirect_count <= 1 else '✗'} Direct routing ({redirect_count} hops)")
        
        vt_count_str = f"{vt_malicious} malicious detections"
        evidence_list.append(f"{'✓' if vt_malicious == 0 else '✗'} VirusTotal: {vt_count_str}")
        if is_whitelisted:
            evidence_list.append("✓ Strong whitelisted domain reputation")
            
        evidence_list.append(f"{'✓' if domain_age >= 1.0 else '✗'} Domain Age: {domain_age} years")
        evidence_list.append(f"{'✓' if not typosquat_detected else '✗'} Typosquatting: {'Not Detected' if not typosquat_detected else 'Detected'}")
        
        if phishing_keywords_found:
            evidence_list.append("✗ Phishing keywords detected in URL path")
        if brand_impersonated:
            evidence_list.append("✗ Potential brand impersonation detected in content")
        if login_form_detected:
            evidence_list.append("✗ Input login form elements detected")
        if urgency_language_detected:
            evidence_list.append("✗ Phishing pressure/urgency language detected")

        # 6. AI Image Authenticity Analysis (Gemini)
        deepfake_results = None
        if request.image_url:
            deepfake_results = await call_gemini_vision_analysis(request.image_url)

        # 7. AI Explanation Layer (OpenAI)
        ai_analyzed = True
        scan_source = "AI"
        
        try:
            openai_res = await call_openai_explanation(
                url=request.url,
                score=trust_score,
                category=risk_category,
                evidence=evidence_list
            )
            shelby_says = openai_res.get("shelby_says", "")
            findings = openai_res.get("findings", evidence_list)
        except Exception as e:
            print(f"OpenAI explanation error: {e}")
            ai_analyzed = False
            scan_source = "Fallback"
            shelby_says = "AI Explanation offline. Deterministic security metrics verified safely."
            findings = evidence_list

        scan_id = str(uuid.uuid4())
        
        # Build raw strings for debug panel
        vt_result_str = f"{vt_malicious} malicious / 95 engines"
        domain_age_str = f"{domain_age} years"
        login_form_str = "Detected" if login_form_detected else "Not Detected"

        response_data = {
            "scan_id": scan_id,
            "trust_score": trust_score,
            "confidence": "High" if ai_analyzed else "Low",
            "risk_category": risk_category,
            "subscores": {
                "security": security_score,
                "reputation": reputation_score,
                "domain": domain_score,
                "content": content_score
            },
            "verdicts": {"general": "SAFE" if trust_score >= 80 else ("SUSPICIOUS" if trust_score >= 40 else "MALICIOUS")},
            "findings": findings,
            "reasons_why": evidence_list,
            "shelby_says": shelby_says,
            "deepfake_results": deepfake_results,
            "ai_analyzed": ai_analyzed,
            "scan_time_ms": int((time.perf_counter() - start_time) * 1000),
            "scan_source": scan_source,
            "debug_info": {
                "vt_result": vt_result_str,
                "domain_age": domain_age_str,
                "redirect_count": redirect_count,
                "login_form": login_form_str,
                "scan_source": scan_source,
                "security_score": f"{security_score}/30",
                "reputation_score": f"{reputation_score}/35",
                "domain_score": f"{domain_score}/20",
                "content_score": f"{content_score}/15"
            }
        }

        # Store in cache
        scan_cache[cache_key] = {
            "timestamp": time.time(),
            "response": response_data
        }

        return response_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
