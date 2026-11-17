# Task: Extract the transcript of "Me at the zoo"

Extract the transcript of the first YouTube video ever uploaded. Based on the browse.sh `youtube.com/extract-transcript` skill definition.

## URL

https://www.youtube.com/watch?v=jNQXAC9IVRw

## Inputs

- Video: "Me at the zoo" (video ID jNQXAC9IVRw)

## Steps

1. Navigate to the video page
2. Find the video title and channel name
3. Open the transcript panel (usually under the "...more" description → "Show transcript")
4. Extract the transcript segments with timestamps

## Output

Return a JSON object:

```json
{
  "success": true,
  "title": "...",
  "channel": "...",
  "has_transcript": true,
  "segments": [{ "ts": "0:00", "text": "..." }],
  "error_reasoning": null
}
```

- If task fails: `success: false`, populate `error_reasoning`
