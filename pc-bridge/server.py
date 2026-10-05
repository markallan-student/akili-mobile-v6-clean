import os
import base64
import subprocess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import uvicorn

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = FastAPI(title="Akili PC Bridge - Universal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === BASIC ===
@app.get("/")
def home():
    return {
        "status": "Akili Bridge OK",
        "tunnel": "https://tournament-avenue-cities-barriers.trycloudflare.com",
        "mode": "cloudflare-universal",
        "controls": ["/eyes", "/control/open?app=chrome", "/control/type?text=hello", "/control/click?x=100&y=200", "/exec?cmd=notepad"]
    }

@app.get("/models")
@app.get("/api/models")
def get_models():
    return {
        "models": [{"id": "default", "name": "Akili Universal Bridge", "status": "connected"}],
        "status": "ok"
    }

@app.get("/mobile")
@app.get("/api/mobile")
@app.get("/health")
def health():
    return {"status": "ok", "connected": True, "bridge": "running", "cloudflare": "online"}

# === EYES - REAL SCREENSHOT ===
@app.get("/eyes")
@app.get("/screenshot")
def screenshot():
    try:
        import mss
        import mss.tools
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            shot = sct.grab(monitor)
            img_bytes = mss.tools.to_png(shot.rgb, shot.size)
            b64 = base64.b64encode(img_bytes).decode()
            return {"status": "ok", "image": f"data:image/png;base64,{b64}"}
    except Exception as e:
        # fallback if mss not installed
        return {"status": "ok", "msg": f"screenshot lib missing: {e}. Run pip install mss pyautogui", "image": None}

# === PC CONTROL ===
@app.get("/control/open")
def open_app(app: str):
    try:
        os.startfile(app) if os.name == 'nt' else subprocess.Popen([app])
        return {"status": "ok", "opened": app}
    except:
        try:
            subprocess.Popen(app, shell=True)
            return {"status": "ok", "opened": app}
        except Exception as e:
            return {"status": "error", "error": str(e)}

@app.get("/control/type")
def type_text(text: str):
    try:
        import pyautogui
        pyautogui.typewrite(text)
        return {"status": "ok", "typed": text}
    except Exception as e:
        return {"status": "error", "error": str(e), "fix": "pip install pyautogui"}

@app.get("/control/click")
def click(x: int, y: int):
    try:
        import pyautogui
        pyautogui.click(x, y)
        return {"status": "ok", "clicked": f"{x},{y}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.get("/exec")
def exec_cmd(cmd: str):
    # DANGER: only you should use this with token!
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return {"status": "ok", "output": result.stdout[:2000], "error": result.stderr[:500]}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.get("/{path:path}")
def catch_all(path: str):
    return {"status": "ok", "path": f"/{path}", "message": "Akili Universal Bridge running"}

if __name__ == "__main__":
    print("\n=== AKILI UNIVERSAL BRIDGE ===")
    print("Running on http://localhost:8000")
    print("Cloudflare: https://tournament-avenue-cities-barriers.trycloudflare.com")
    print("Frontend: http://localhost:3000")
    print("Install extras: pip install mss pyautogui")
    print("===============================\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)