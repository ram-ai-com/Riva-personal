# GitHub Auto PR Reviewer & Rater (Powered by Gemini AI)

This project contains an automated GitHub Action that automatically reviews and rates pull request code updates out of 10 when developers open or update a PR. It highlights the positive aspects of the code changes, points out bugs/security issues/improvements, and posts the detailed review comment directly onto the GitHub PR page.

---

## Features

- **Automated PR Reviews**: Triggers on PR `opened` and `synchronize` (subsequent pushes) events.
- **Smart 1-to-10 Rating**: Evaluates changes on completeness, security, style, and correctness.
- **Single-Comment updates**: Automatically updates its own previous comment on new pushes to avoid cluttering the PR conversation log.
- **Local Sandbox Mode**: Verify the AI prompts and review engine on *any public GitHub PR* from your command line without committing any code.
- **File Filter**: Automatically skips lock files, binary files, and media assets to keep Gemini API tokens optimized.

---

## 🚀 GitHub Actions Setup Guide

To integrate this reviewer in your GitHub repository, follow these 3 steps:

### 1. Save Your Gemini API Key as a Repository Secret
1. Go to your GitHub repository.
2. Navigate to **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret**.
4. Name the secret **`GEMINI_API_KEY`**.
5. Paste your Gemini API key (you can obtain one from [Google AI Studio](https://aistudio.google.com/)) and click **Add secret**.

### 2. Copy the Files to Your Repository
Ensure your repository has the following file structure:
```
your-repo/
├── .github/
│   └── workflows/
│       └── pr-reviewer.yml     # Workflow file
├── src/
│   └── review.js               # Review runner script
├── package.json                # Project dependencies
└── package-lock.json
```

### 3. Open a Pull Request
Once pushed to your main branch, open any new Pull Request! The workflow will run immediately, and within 10–15 seconds, the AI bot will post a detailed review comment like this:

> ### 🤖 AI Pull Request Review & Rating
> #### 📊 Score: 8.5/10
> *The changes are highly organized and introduce robust validation, but a minor boundary-check warning is present in the main handler.*
>
> #### 🔍 Key Changes Summarized
> - Refactored `userHandler.js` to support async password hashing.
> - Added unit tests in `userHandler.test.js`.
> ...

---

## 💻 Local Testing Guide

You can test the review and rating engine on **any public GitHub PR** directly from your local terminal.

### 1. Install Dependencies
Run this in the repository directory:
```bash
npm install
```

### 2. Configure Environment Variables
Create a file named `.env` in the root of the project:
```env
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: GITHUB_TOKEN=your_personal_access_token (increases API rate limits)
```

### 3. Run the Local Command
Pass the URL of any public GitHub PR to the test script:
```bash
npm run test-local https://github.com/vitejs/vite/pull/16000
```
This downloads the PR's details, executes the prompt, and writes the markdown review output directly to your console!
