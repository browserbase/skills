---
name: browserbase-auth
description: Guide Claude through interactive authentication flows using the stagehand CLI
---

# Authentication Skill

Guide Claude through interactive authentication flows using the `stagehand` CLI.

## When to Use

Use this skill when:
- A website requires login to access content
- You encounter a login page or authentication wall
- The user needs to authenticate to complete a task
- Session cookies have expired

## Authentication Flow

### 1. Detect Login Page

After navigating to a URL, check if authentication is needed:

```bash
stagehand snapshot
```

Look for indicators:
- Form elements with `type="password"` or `type="email"`
- Text containing "sign in", "log in", "username", "password"
- OAuth buttons (Google, GitHub, Microsoft, etc.)

### 2. Prompt User for Credentials

**Always ask the user for credentials - never assume or store them.**

Example prompt:
```
I've detected a login page. To continue, I'll need your credentials:

1. What is your email/username?
2. What is your password?

Note: Your credentials will only be used to fill the login form and won't be stored.
```

### 3. Fill Login Form

Use the snapshot refs to identify form fields:

```bash
# Get the current page state
stagehand snapshot

# Fill the email/username field
stagehand fill @0-5 "user@example.com"

# Fill the password field  
stagehand fill @0-8 "their-password"

# Click the submit button
stagehand click @0-12
```

### 4. Handle 2FA/MFA

If a 2FA prompt appears after login:

```bash
stagehand snapshot
```

Prompt the user:
```
Two-factor authentication is required. Please provide:
- The code from your authenticator app, OR
- The code sent to your phone/email

What is your 2FA code?
```

Then fill and submit:
```bash
stagehand fill @0-3 "123456"
stagehand click @0-5
```

### 5. Verify Success

After submitting credentials:

```bash
stagehand wait networkidle
stagehand snapshot
```

Check for:
- Redirect away from login page
- User profile/avatar elements
- Dashboard or home page content
- Absence of error messages

If login failed:
```
The login attempt was unsuccessful. I see an error message: "[error text]"

Would you like to:
1. Try again with different credentials
2. Use a different login method (OAuth, SSO)
3. Reset your password
```

## OAuth/SSO Flows

For OAuth buttons (Google, GitHub, etc.):

1. Click the OAuth button
2. A popup or redirect will occur
3. User completes authentication in the OAuth provider
4. Wait for redirect back to the original site

```bash
# Click OAuth button
stagehand click @0-15

# Wait for OAuth flow to complete
stagehand wait networkidle

# Verify authentication succeeded
stagehand snapshot
```

## Common Patterns

### Username + Password Form
```html
<form>
  <input type="email" name="email">
  <input type="password" name="password">
  <button type="submit">Sign In</button>
</form>
```

### Magic Link / Passwordless
```
I see this site uses passwordless authentication (magic link).

1. Enter your email address
2. Check your email for the login link
3. Let me know when you've clicked the link

What email should I use?
```

### CAPTCHA
```
This login page has a CAPTCHA. I cannot solve CAPTCHAs automatically.

Options:
1. Use `stagehand session live` to open the browser and solve it manually
2. Try a different authentication method
3. Contact the site administrator
```

## Security Reminders

- Never store or log user credentials
- Credentials are only used to fill form fields
- Recommend users use password managers
- Suggest enabling 2FA when available
- Clear sensitive data from conversation context after use

## Troubleshooting

### Login button doesn't work
```bash
# Try waiting for page to be fully loaded
stagehand wait networkidle

# Check if button is actually clickable
stagehand snapshot

# Try clicking by coordinates if ref doesn't work
stagehand click 450,320
```

### Form fields not found
```bash
# Get full snapshot to find correct refs
stagehand snapshot

# Try using evaluate to find elements
stagehand eval "document.querySelector('input[type=password]')?.id"
```

### Session expires quickly
- Some sites have short session timeouts
- Consider using `stagehand session create` with Browserbase for persistent sessions
- Check if "Remember me" checkbox is available
