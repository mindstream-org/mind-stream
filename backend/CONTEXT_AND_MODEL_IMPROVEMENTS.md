# Context & Model Improvements

## Issue: Too Focused on Single Active Tab

**Current Problem:**
The script generation focuses heavily on the single active tab (`active_tab_domain`, `active_tab_title`), which can be misleading:
- User might have just switched to a tab briefly
- Doesn't capture the overall browsing context
- Can misinterpret user's actual activity

**Solution: Aggregate Tab Context**

Instead of just the active tab, pass aggregated information:

### Recommended Context Structure

```json
{
  "context": {
    // NEW: Aggregated tab summary
    "tab_summary": {
      "total_open": 12,
      "categories": {
        "work": 5,          // GitHub, VSCode docs, StackOverflow
        "social": 3,        // Twitter, Reddit, YouTube
        "entertainment": 2, // Netflix, Spotify
        "other": 2
      },
      "primary_activity": "work",  // The dominant category
      "recent_switches": 4         // Number of tab switches in last 10 min
    },
    
    // Optional: Keep active tab for reference but make it less prominent
    "current_tab_category": "social",  // Just category, not full details
    
    // Keep these as-is
    "user_name": "Prash",
    "local_weather": "Rainy, 22°C",
    "time_of_day": "night",
    "session_duration_minutes": 47,
    "idle_minutes_since_last_activity": 2
  }
}
```

### Implementation in Extension (Phase 1)

**In `src/lib/checkIn.js` or equivalent:**

```javascript
function buildCheckInPayload() {
  // Get all tabs
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Categorize tabs
  const categories = {
    work: [],
    social: [],
    entertainment: [],
    other: []
  };
  
  tabs.forEach(tab => {
    const category = categorizeTab(tab.url, tab.title);
    categories[category].push(tab);
  });
  
  // Find dominant category
  const primaryActivity = Object.keys(categories)
    .reduce((a, b) => categories[a].length > categories[b].length ? a : b);
  
  return {
    tab_summary: {
      total_open: tabs.length,
      categories: {
        work: categories.work.length,
        social: categories.social.length,
        entertainment: categories.entertainment.length,
        other: categories.other.length
      },
      primary_activity: primaryActivity,
      recent_switches: getRecentTabSwitches() // Track this via chrome.tabs.onActivated
    },
    current_tab_category: categorizeTab(activeTab.url),
    user_name: "Prash",
    // ... rest of context
  };
}

function categorizeTab(url, title) {
  if (url.includes('github') || url.includes('stackoverflow') || 
      url.includes('docs') || url.includes('localhost')) {
    return 'work';
  }
  if (url.includes('twitter') || url.includes('reddit') || 
      url.includes('facebook') || url.includes('instagram')) {
    return 'social';
  }
  if (url.includes('youtube') || url.includes('netflix') || 
      url.includes('twitch') || url.includes('spotify')) {
    return 'entertainment';
  }
  return 'other';
}
```

---

## Improved Gemini Prompt

**Changes:**
1. Use aggregated tab context instead of specific tab details
2. Less prescriptive, more natural
3. Emphasize pattern recognition over single-moment focus

### Updated Prompt

```python
def generate_script(self, emotion: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tab_summary = context.get("tab_summary", {})
    primary_activity = tab_summary.get("primary_activity", "browsing")
    total_tabs = tab_summary.get("total_open", 0)
    categories = tab_summary.get("categories", {})
    
    duration = context.get("session_duration_minutes", 0)
    user_name = context.get("user_name", "friend")
    time_of_day = context.get("time_of_day", "today")
    local_weather = context.get("local_weather", "calm")

    # Build a natural description of their digital environment
    activity_desc = f"{primary_activity}"
    if total_tabs > 5:
        activity_desc += f" with {total_tabs} tabs open"
    if categories.get("work", 0) > 0 and categories.get("social", 0) > 0:
        activity_desc += f", moving between work and distractions"

    prompt = f"""You are a wise, warm presence speaking to {user_name}, who is feeling {emotion}.

Context:
- {user_name} has been at their computer for {duration} minutes during {time_of_day}
- They've been primarily doing: {activity_desc}
- The emotional state right now: {emotion}
- Outside: {local_weather}

Generate a 45-60 second spoken reflection (grandfather-like voice) that:
1. Gently acknowledges where they are right now—not just the screen, but the pattern of their attention
2. Uses ONE vivid, grounding metaphor from nature that mirrors {emotion}
3. Validates the feeling without judgment
4. Offers ONE simple physical anchor (breath, ground, hands, eyes)
5. Ends with permission to simply be

Guidelines:
- Don't be prescriptive or coaching-like
- Speak WITH them, not AT them
- No corporate wellness language
- Be specific to their situation but not overly literal about tabs/screens

Return ONLY valid JSON:
{{
  "script": "<complete spoken text>",
  "subtitles": ["<4-6 word phrase>", "..."]
}}

Subtitles must cover the ENTIRE script, in order, 4-6 words per phrase."""

    # ... rest of method
```

---

## Model Selection: Gemini vs Groq

### Current: Gemini 2.5 Flash

**Pros:**
- Fast, cheap
- Good at following JSON structure
- Reliable formatting

**Cons:**
- Can be generic/corporate
- Sometimes overly safe/bland
- May not capture emotional nuance well

### Groq Options

#### **Recommended: `llama-3.3-70b-versatile`**

**Why:**
- Excellent at creative writing with emotional depth
- 70B model = much more nuanced than Gemini Flash
- Groq's inference is **blazing fast** (often faster than Gemini despite larger model)
- Free tier is generous
- "versatile" variant is tuned for varied tasks including creative writing

**Cons:**
- Sometimes less strict about JSON formatting (need better parsing)
- May need prompt adjustments

#### Alternative: `llama-3.1-8b-instant`

**Use if:**
- You want maximum speed
- Budget/rate limits are very tight

**Skip:**
- Smaller model = less nuanced, more generic output (similar to Gemini Flash quality)

### Implementation: Support Both

Add model selection to your `.env`:

```bash
# Script generation model
SCRIPT_MODEL_PROVIDER=groq  # or "gemini"
SCRIPT_MODEL_NAME=llama-3.3-70b-versatile

# API keys
GEMINI_API_KEY=your_key
GROQ_API_KEY=your_groq_key
```

### Code Changes

```python
class ReelGenerator:
    def __init__(self, ...):
        self.script_model_provider = os.getenv("SCRIPT_MODEL_PROVIDER", "gemini")
        self.script_model_name = os.getenv("SCRIPT_MODEL_NAME", "gemini-2.5-flash")
        
        if self.script_model_provider == "groq":
            self.groq_key = os.getenv("GROQ_API_KEY")
            if not self.groq_key:
                raise ValueError("GROQ_API_KEY required when SCRIPT_MODEL_PROVIDER=groq")
        
    def generate_script(self, emotion, context):
        if self.script_model_provider == "groq":
            return self._generate_script_groq(emotion, context)
        else:
            return self._generate_script_gemini(emotion, context)
    
    def _generate_script_groq(self, emotion, context):
        """Use Groq API (OpenAI-compatible)"""
        import requests
        
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.groq_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": self.script_model_name,
                "messages": [
                    {"role": "system", "content": "You are a warm, wise elder creating personalized mindfulness scripts."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.8,  # More creative
                "response_format": {"type": "json_object"}  # Forces JSON output
            }
        )
        
        # Parse response
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
```

---

## Testing Strategy

### 1. Test Aggregated Context

Update `data/sample_emotion_result.json`:

```json
{
  "job_id": "sample-job-002",
  "emotion": {
    "label": "distracted",
    "confidence": 0.75
  },
  "context": {
    "tab_summary": {
      "total_open": 15,
      "categories": {
        "work": 3,
        "social": 7,
        "entertainment": 4,
        "other": 1
      },
      "primary_activity": "social",
      "recent_switches": 12
    },
    "current_tab_category": "social",
    "user_name": "Prash",
    "local_weather": "Clear, 28°C",
    "time_of_day": "afternoon",
    "session_duration_minutes": 67,
    "idle_minutes_since_last_activity": 1
  }
}
```

### 2. A/B Test Models

Run same input through both models:

```bash
# Test Gemini
SCRIPT_MODEL_PROVIDER=gemini ./test.sh

# Test Groq Llama 3.3 70B
SCRIPT_MODEL_PROVIDER=groq SCRIPT_MODEL_NAME=llama-3.3-70b-versatile ./test.sh
```

Compare outputs for:
- Emotional depth
- Personalization
- Generic vs specific language
- JSON formatting reliability

---

## Recommendation

### Phase 1 (Immediate):
1. **Keep Gemini for now** until you implement aggregated context in the extension
2. **Update the prompt** to be less focused on single tab (use generic "browsing" language)
3. **Remove specific tab title mentions** from the current prompt

### Phase 2 (After extension work):
1. **Implement aggregated tab context** in Phase 1 (extension)
2. **Add Groq support** with `llama-3.3-70b-versatile`
3. **A/B test** and choose the better model
4. **Keep both as options** (env var toggle)

### Likely Winner: Llama 3.3 70B via Groq

**Reasoning:**
- 70B model will produce significantly more nuanced, emotionally intelligent scripts
- Groq is **faster** than Gemini despite larger model size
- Better at creative, empathetic writing (not just factual/instructional)
- Gemini tends toward corporate/safe language; Llama can be warmer

**Only concern:** JSON formatting reliability—but with `response_format: {type: "json_object"}`, Groq forces valid JSON output.

---

## Quick Fix for Current Version

Update just the prompt to be less tab-specific:

```python
# Instead of:
# "What they were doing: {activity} on {active_tab_domain}"

# Use:
# "What they've been doing: {activity} online"

# Remove this line entirely:
# "mention {active_tab_domain} or the tab title if it's interesting"
```

This makes it generic enough to work with current single-tab data while not sounding awkward when you switch to aggregated context.

---

**Next Steps:**
1. Want me to implement the Groq support now?
2. Or just update the prompt to be more generic first?
3. Or focus on extension changes to aggregate tabs first?
