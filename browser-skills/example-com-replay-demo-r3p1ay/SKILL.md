---
name: example-com-replay-demo-r3p1ay
title: Replay Demo
description: Synthetic localhost skill for testing Browserbase session replay playback.
website: example.com
category: testing
tags:
  - replay
  - hls
  - browserbase
source: 'community: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: browser
alternative_methods: []
verified: true
proxies: false
---
# Replay Demo

## Purpose
Provide a stable localhost test page for Browserbase session replay playback.

## When to Use
Use this skill when you need to verify that the skill page modal can load and play a stored replay session.

## Workflow
1. Open the replay modal from the skill page.
2. Wait for the HLS manifest to load.
3. Confirm the video timeline advances and segment requests succeed.

## Site-Specific Gotchas
This is a synthetic local test skill. The replay content comes from a real Browserbase session, but the markdown and reference image are only for frontend validation.

## Expected Output
A skill page on localhost with a reference image and a working Watch Replay modal.
