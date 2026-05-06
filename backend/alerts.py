"""
Price Alert system — JSON persistence + Gmail SMTP + background price monitor.

Required .env vars (only needed for email):
  ALERT_EMAIL_FROM=kanchi2802@gmail.com
  ALERT_EMAIL_TO=kanchi2802@gmail.com
  GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← 16-char app password from
                                               myaccount.google.com/apppasswords
"""

import asyncio
import json
import os
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import yfinance as yf

from utils import logger

# ── Config ────────────────────────────────────────────────────────────────
_ALERTS_FILE    = os.path.join(os.path.dirname(__file__), "alerts.json")
_EMAIL_FROM     = os.environ.get("ALERT_EMAIL_FROM", "")
_EMAIL_TO       = os.environ.get("ALERT_EMAIL_TO", _EMAIL_FROM)
_EMAIL_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
_POLL_INTERVAL  = int(os.environ.get("ALERT_POLL_SECONDS", 60))


# ── Persistence ───────────────────────────────────────────────────────────

def _load() -> list[dict]:
    try:
        with open(_ALERTS_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def _save(alerts: list[dict]) -> None:
    try:
        with open(_ALERTS_FILE, "w") as f:
            json.dump(alerts, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save alerts: {e}")


# ── CRUD ──────────────────────────────────────────────────────────────────

def list_alerts() -> list[dict]:
    return _load()


def create_alert(
    ticker: str,
    name: str,
    target_price: float,
    direction: str,           # "above" | "below"
    current_price: float,
) -> dict:
    alerts = _load()
    alert = {
        "id":                     str(uuid.uuid4())[:8],
        "ticker":                 ticker.upper(),
        "name":                   name,
        "target_price":           round(target_price, 2),
        "direction":              direction,
        "price_at_creation":      round(current_price, 2),
        "created_at":             datetime.now(timezone.utc).isoformat(),
        "triggered":              False,
        "triggered_at":           None,
        "triggered_price":        None,
        "browser_notified":       False,
    }
    alerts.append(alert)
    _save(alerts)
    logger.info(f"Alert created: {ticker} {direction} ${target_price:.2f}")
    return alert


def delete_alert(alert_id: str) -> bool:
    alerts = _load()
    filtered = [a for a in alerts if a["id"] != alert_id]
    if len(filtered) == len(alerts):
        return False
    _save(filtered)
    return True


def clear_triggered() -> int:
    alerts = _load()
    active = [a for a in alerts if not a["triggered"]]
    removed = len(alerts) - len(active)
    _save(active)
    return removed


def pop_pending_browser_notifications() -> list[dict]:
    """Return triggered alerts not yet browser-notified, mark them as notified."""
    alerts = _load()
    pending = [a for a in alerts if a["triggered"] and not a.get("browser_notified")]
    if pending:
        ids = {a["id"] for a in pending}
        for a in alerts:
            if a["id"] in ids:
                a["browser_notified"] = True
        _save(alerts)
    return pending


# ── Price fetch ───────────────────────────────────────────────────────────

def _live_price(ticker: str) -> Optional[float]:
    try:
        fi = yf.Ticker(ticker).fast_info
        p  = getattr(fi, "last_price", None)
        return float(p) if p else None
    except Exception:
        return None


# ── Email ─────────────────────────────────────────────────────────────────

def email_configured() -> bool:
    return bool(_EMAIL_FROM and _EMAIL_PASSWORD)


def send_test_email() -> None:
    """Raises on failure."""
    _send_email({
        "ticker": "TEST",
        "name": "Test Alert",
        "direction": "above",
        "target_price": 100.0,
        "price_at_creation": 95.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, current_price=105.0)


def _send_email(alert: dict, current_price: float) -> None:
    if not email_configured():
        logger.warning("Email not configured — skipping alert email")
        return

    direction_word = "risen above" if alert["direction"] == "above" else "fallen below"
    chg_pct = ((current_price / alert["price_at_creation"]) - 1) * 100
    chg_sign = "+" if chg_pct >= 0 else ""
    price_color = "#34d399" if alert["direction"] == "above" else "#f87171"

    subject = f"🔔 {alert['ticker']} price alert — ${current_price:.2f} ({chg_sign}{chg_pct:.1f}%)"

    html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f1117;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:32px auto;background:#1a1f2e;border-radius:12px;
            padding:28px;border:1px solid #2d3748;">
  <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">
    Price Alert Triggered
  </p>
  <h1 style="margin:0 0 20px;font-size:22px;color:#e5e7eb;">
    {alert['name']} <span style="color:#60a5fa;">({alert['ticker']})</span>
  </h1>

  <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;">
    The stock has <strong style="color:#e5e7eb;">{direction_word}</strong>
    your target of <strong style="color:#e5e7eb;">${alert['target_price']:.2f}</strong>.
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr style="border-bottom:1px solid #2d3748;">
      <td style="padding:10px 0;color:#6b7280;font-size:13px;">Current price</td>
      <td style="padding:10px 0;text-align:right;font-size:20px;
                 font-weight:700;color:{price_color};font-family:monospace;">
        ${current_price:.2f}
      </td>
    </tr>
    <tr style="border-bottom:1px solid #2d3748;">
      <td style="padding:10px 0;color:#6b7280;font-size:13px;">Your target</td>
      <td style="padding:10px 0;text-align:right;color:#e5e7eb;font-family:monospace;">
        ${alert['target_price']:.2f}
      </td>
    </tr>
    <tr>
      <td style="padding:10px 0;color:#6b7280;font-size:13px;">Price when alert was set</td>
      <td style="padding:10px 0;text-align:right;color:#e5e7eb;font-family:monospace;">
        ${alert['price_at_creation']:.2f}
        <span style="font-size:12px;color:{'#34d399' if chg_pct>=0 else '#f87171'};">
          ({chg_sign}{chg_pct:.1f}%)
        </span>
      </td>
    </tr>
  </table>

  <p style="margin:0;color:#4b5563;font-size:11px;">
    Alert set on {alert['created_at'][:10]} · StockScreenAI
  </p>
</div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = _EMAIL_FROM
    msg["To"]      = _EMAIL_TO
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
        smtp.login(_EMAIL_FROM, _EMAIL_PASSWORD)
        smtp.sendmail(_EMAIL_FROM, _EMAIL_TO, msg.as_string())


# ── Background monitor ────────────────────────────────────────────────────

async def alert_monitor() -> None:
    """Checks all active alerts every ALERT_POLL_SECONDS seconds."""
    logger.info(f"Alert monitor started (interval={_POLL_INTERVAL}s, "
                f"email={'on' if email_configured() else 'off — set GMAIL_APP_PASSWORD to enable'})")
    while True:
        await asyncio.sleep(_POLL_INTERVAL)
        try:
            alerts  = _load()
            active  = [a for a in alerts if not a["triggered"]]
            if not active:
                continue

            changed = False
            for alert in alerts:
                if alert["triggered"]:
                    continue
                price = _live_price(alert["ticker"])
                if price is None:
                    continue

                hit = (
                    (alert["direction"] == "above" and price >= alert["target_price"]) or
                    (alert["direction"] == "below" and price <= alert["target_price"])
                )
                if not hit:
                    continue

                alert["triggered"]       = True
                alert["triggered_at"]    = datetime.now(timezone.utc).isoformat()
                alert["triggered_price"] = round(price, 2)
                changed = True
                logger.info(f"Alert hit: {alert['ticker']} @ ${price:.2f} "
                            f"(target {alert['direction']} ${alert['target_price']:.2f})")
                try:
                    _send_email(alert, price)
                except Exception as e:
                    logger.warning(f"Alert email failed for {alert['ticker']}: {e}")

            if changed:
                _save(alerts)

        except Exception as e:
            logger.warning(f"Alert monitor error: {e}")
