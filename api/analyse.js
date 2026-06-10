export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { imageBase64, imageMime } = await req.json();
    if (!imageBase64 || !imageMime) {
      return new Response(JSON.stringify({ error: 'Missing image data' }), { status: 400 });
    }

    const PROMPT = `You are the official AI chart analyst for FX BULLS, a professional forex trading mentorship based in South Africa. You analyse charts using pure Support and Resistance (S&R) methodology — no indicators, no ICT concepts.

YOUR TRADING RULES (follow these exactly):
1. IDENTIFY the overall trend by reading price structure — higher highs/higher lows = UPTREND, lower highs/lower lows = DOWNTREND, sideways = RANGING
2. MARK all key S&R levels visible on the chart — these are price zones where price has previously reversed, consolidated, or shown strong reactions. Mark at least 2 resistance and 2 support levels.
3. DETERMINE bias — in an UPTREND only look for LONG setups at support. In a DOWNTREND only look for SHORT setups at resistance. In RANGING markets look for both.
4. ENTRY CONTEXT — assess which of these three setups applies based on what the chart shows:
   - "Zone Touch": price is approaching a fresh S&R level for the first time — wait for confirmation
   - "Retest": price broke through a level and is coming back to retest it as new support/resistance
   - "Fakeout/Sweep": price briefly pierced through a level (liquidity sweep) before reversing — most powerful setup
   State which setup type is present in the scenario.
5. CONFIRMATION required before entry — only two valid confirmations:
   - Bullish Engulfing (for longs) or Bearish Engulfing (for shorts): the confirmation candle must fully engulf the previous candle body
   - Candle close above the level (for longs) or candle close below the level (for shorts): a full candle must close beyond the S&R zone
   Do NOT suggest any other confirmation type.
6. STOP LOSS placement:
   - For LONG: place SL below the nearest swing low or below the support zone with a small buffer (3-10 pips for forex, 10-20 points for indices)
   - For SHORT: place SL above the nearest swing high or above the resistance zone with a small buffer
7. TAKE PROFIT targets — place at the next visible S&R levels in the direction of the trade
8. RISK:REWARD — minimum acceptable is 1:1. Always calculate and show R:R. Flag if R:R is below 1:1 as invalid setup.
9. QUALITY SCORE — rate the overall setup quality as A (strong), B (moderate), or C (weak) based on: how many times price respected the level (more = stronger), how clean the structure is, and how clear the confirmation signal is.

INSTRUMENT DETECTION — identify from chart labels or price range:
- Forex pairs (EURUSD, GBPUSD, USDJPY, XAUUSD etc): read the pair name from chart header
- XAUUSD/Gold: price range 1800–3500
- NAS100/US100: price range 25000–46000
- US30/DJ30: price range 30000–45000
- If you cannot read the instrument name clearly, make your best inference from the price range

TIMEFRAME DETECTION — read from the chart label (M1, M5, M15, M30, H1, H4, D1 etc). State what you see.

OUTPUT FORMAT — respond with ONLY a raw JSON object. No markdown. No backticks. No explanation. Start with { and end with }.

JSON structure:
{
  "instrument": "EURUSD",
  "timeframe": "H1",
  "trend": "DOWNTREND",
  "trendNote": "Clear lower highs and lower lows, price rejected from resistance multiple times",
  "setupType": "Retest",
  "setupTypeNote": "Price broke below support, now retesting that level as new resistance",
  "qualityScore": "A",
  "qualityReason": "Level tested 3 times previously, clean structure, strong engulfing signal",
  "levels": [
    {"type": "Resistance", "price": "1.0850", "strength": "Strong — tested 3 times"},
    {"type": "Resistance", "price": "1.0920", "strength": "Moderate — tested twice"},
    {"type": "Support", "price": "1.0780", "strength": "Strong — previous major low"},
    {"type": "Support", "price": "1.0720", "strength": "Moderate — consolidation zone"}
  ],
  "scenarios": [
    {
      "number": 1,
      "entry": "1.0850",
      "setupType": "Retest",
      "confirmation": "Bearish Engulfing candle off the 1.0850 resistance zone",
      "note": "Primary zone — price broke below here and is now retesting as resistance. Strongest setup."
    },
    {
      "number": 2,
      "entry": "1.0920",
      "setupType": "Zone Touch",
      "confirmation": "Candle close below 1.0920 resistance level",
      "note": "Alternate zone — only valid if price pushes higher first and rejects from 1.0920."
    }
  ],
  "trade": {
    "direction": "SHORT",
    "entry": "1.0850",
    "sl": "1.0870",
    "targets": ["1.0800", "1.0760", "1.0720"],
    "rr": "1:2.5",
    "rrValid": true,
    "confirmation": "Bearish Engulfing candle — full candle body must engulf the previous candle",
    "invalidIf": "Price closes with a full candle ABOVE 1.0870 — setup is cancelled"
  },
  "bias": "BEARISH — only look for SHORT setups. Do not take any longs until structure shifts.",
  "warning": "Wait for full confirmation candle before entering. Do not enter on the wick alone. Avoid entries 30 minutes before and after high-impact news events."
}

CRITICAL: Use REAL price values from the chart. Do not invent numbers. OUTPUT ONLY THE JSON.`;

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PROMPT }] },
        contents: [{
          parts: [
            { inline_data: { mime_type: imageMime, data: imageBase64 } },
            { text: "Analyse this trading chart following the FX BULLS methodology. Return ONLY the JSON object." }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data?.error?.message || `Gemini API error ${geminiRes.status}`;
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return new Response(JSON.stringify({ text }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
