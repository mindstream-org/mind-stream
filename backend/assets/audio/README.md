# Ambient Audio Files for MindStream

This directory contains subtle background audio tracks for each emotion category.

## Required Files

Create the following 5 audio files (each 60-90 seconds long, MP3 format, 128-192kbps):

### 1. `frustrated.mp3`
**Mood:** Grounding, calming tension, acknowledging storm
**AI Generation Prompt:**
```
Generate a 60-second ambient soundscape for someone feeling frustrated. Include:
- Distant thunder rumbling (very subtle, not alarming)
- Gentle rain on leaves (consistent, soothing)
- Deep, slow breathing sounds (almost subliminal)
- Low-frequency hum (40-60Hz) for grounding
- No melodies, just textures
- Volume should stay consistent (no sudden changes)
- Overall feeling: "The storm will pass"
```

### 2. `fatigued.mp3`
**Mood:** Restorative, gentle support, permission to rest
**AI Generation Prompt:**
```
Generate a 60-second ambient soundscape for someone feeling fatigued. Include:
- Soft piano notes (very sparse, like 1 every 5-10 seconds)
- Warm pad sounds (like a gentle blanket)
- Slow ocean waves (distant, not crashing)
- Subtle birds chirping (far away, dawn-like)
- No rhythmic elements
- Overall feeling: "Rest is allowed"
```

### 3. `distracted.mp3`
**Mood:** Refocusing, gentle anchor, returning to center
**AI Generation Prompt:**
```
Generate a 60-second ambient soundscape for someone feeling distracted. Include:
- Calm ocean waves (regular rhythm, not too fast)
- Gentle wind through trees
- Single bell tone every 15-20 seconds (soft, not jarring)
- White noise layer (very subtle, like distant stream)
- No sudden changes in dynamics
- Overall feeling: "Come back to this moment"
```

### 4. `anxious.mp3`
**Mood:** Calming nervous system, slowing down, safety
**AI Generation Prompt:**
```
Generate a 60-second ambient soundscape for someone feeling anxious. Include:
- Very slow breathing sounds (4 seconds in, 6 seconds out)
- Soft humming drone (like a distant Om)
- Crickets at night (steady, not too loud)
- Gentle heartbeat rhythm (slowed down, 50-60 BPM)
- Minimal movement in the soundscape
- Overall feeling: "You are safe"
```

### 5. `neutral.mp3`
**Mood:** Balanced, present, simply here
**AI Generation Prompt:**
```
Generate a 60-second ambient soundscape for a neutral/balanced state. Include:
- White noise (like distant waterfall)
- Minimal drone (single sustained note, no melody)
- Very occasional nature sounds (bird, rustling, breeze)
- No rhythm, no pattern
- Ultra-minimal, space-focused
- Overall feeling: "Just being"
```

## How to Generate with AI

### Option 1: Suno AI (suno.ai)
1. Go to https://suno.ai
2. Paste the prompt for each emotion
3. Select "Instrumental" mode
4. Generate and download as MP3
5. Trim to 60 seconds if needed

### Option 2: Stable Audio (stability.ai)
1. Go to Stable Audio
2. Use the prompts above
3. Set duration to 60 seconds
4. Download and save

### Option 3: Splice/Soundraw
1. Use AI music generation features
2. Focus on "ambient", "meditation", "soundscape" tags
3. Remove any melodic elements
4. Export as MP3

## Volume Mixing

These files will be played at **12% volume** underneath the TTS audio in the final reel.  
They should NOT be mastered/normalized to full volume — leave them relatively quiet.

## License

Ensure all generated audio is either:
- Royalty-free from the AI platform
- Created by you
- Licensed for commercial use (if needed for your project)

## Testing

After creating the files, test them:
```bash
# Play a file to check volume/mood
mpv assets/audio/frustrated.mp3

# Run a reel generation to hear the mix
./test.sh
```
