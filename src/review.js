import core from '@actions/core';
import github from '@actions/github';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BOT_IDENTIFIER = '<!-- RAM.AI_BOT-->';
const MAX_DIFF_LENGTH = 800000; // ~150-200k tokens safety limit

// File extensions or names to ignore in review
const IGNORED_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'go.sum',
  '.gitignore',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.pdf',
  '*.zip',
  '*.tar.gz'
];

/**
 * Filter diff files to keep it clean and within token limits
 */
function preprocessDiff(rawDiff) {
  if (!rawDiff) return '';
  
  // If the diff is short enough, use it as is
  if (rawDiff.length <= MAX_DIFF_LENGTH) {
    return rawDiff;
  }
  
  core.info(`Diff length (${rawDiff.length}) exceeds safety limit. Truncating large files or lines...`);
  
  const lines = rawDiff.split('\n');
  let currentLength = 0;
  const processedLines = [];
  
  for (const line of lines) {
    // If it's a file header, check if we should skip
    if (line.startsWith('diff --git')) {
      const isIgnored = IGNORED_FILES.some(pattern => {
        if (pattern.startsWith('*.')) {
          const ext = pattern.slice(1);
          return line.endsWith(ext);
        }
        return line.includes(pattern);
      });
      
      if (isIgnored) {
        // Skip lines until the next file diff starts
        continue;
      }
    }
    
    processedLines.push(line);
    currentLength += line.length + 1;
    
    if (currentLength >= MAX_DIFF_LENGTH) {
      processedLines.push('\n... [Diff truncated due to size limits] ...');
      break;
    }
  }
  
  return processedLines.join('\n');
}

async function run() {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is missing.');
    }
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing. Please add it to repository secrets.');
    }

    const { context } = github;
    const prPayload = context.payload.pull_request;

    if (!prPayload) {
      core.info('This action only runs on pull_request events. Skipping.');
      return;
    }

    const prNumber = prPayload.number;
    const { owner, repo } = context.repo;
    const prTitle = prPayload.title;
    const prDescription = prPayload.body || 'No description provided.';

    core.info(`Starting review for PR #${prNumber} in ${owner}/${repo}`);
    core.info(`PR Title: ${prTitle}`);

    const octokit = github.getOctokit(githubToken);

    // 1. Fetch the pull request diff
    core.info('Fetching PR diff from GitHub...');
    const { data: rawDiff } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      headers: {
        accept: 'application/vnd.github.v3.diff',
      },
    });

    const diff = preprocessDiff(rawDiff);
    if (!diff || diff.trim() === '') {
      core.info('No code changes detected or all changes are in ignored files. Skipping review.');
      return;
    }

    // 2. Call Gemini API
    core.info('Sending diff to Gemini for review...');
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    // Use gemini-1.5-flash as default for optimal speed & cost
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.2, // Lower temperature for more consistent, objective reviews
      }
    });

    const prompt = `You are an elite software engineer and code reviewer.
Your job is to thoroughly review the Pull Request (PR) diff below, rate the updates out of 10, and provide constructive feedback directly to the developer.

PR Details:
- Title: ${prTitle}
- Description: ${prDescription}

Guidelines for Review:
1. Be polite, encouraging, and highly technical.
2. Give a clear **Rating out of 10** (e.g. 7.5/10) based on code quality, correctness, potential bugs, adherence to best practices, security, and performance. Be fair: a simple but perfectly written PR should get a high score (9/10 or 10/10), whereas code with bugs, security risks, or spaghetti structure should get lower scores.
3. Keep suggestions actionable and precise. Recommend lines to fix and write code examples where helpful.
4. Exclude noise: do not complain about style changes unless they violate major readability principles.
5. If the PR has zero issues, congratulate the developer and explain why it's excellent.

Format your response in beautiful GitHub-Flavored Markdown. Use the following structured outline:

# 🤖 AI Pull Request Review & Rating

## 📊 Score: [X]/10
*[Add a brief 1-2 sentence high-level summary of the rating here]*

## 🔍 Key Changes Summarized
* [Bullet point list of primary changes]

## 🌟 The Good
* [What went well, clean patterns, or good decisions]

## 🛠️ Areas for Improvement
* [Specific, actionable feedback. Group by Severity: Critical, Warning, or Suggestion. Provide code snippets if recommending changes.]

---
*Review generated by Gemini AI.*`;

    const result = await model.generateContent([
      { text: prompt },
      { text: `Here is the code diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` }
    ]);
    const response = await result.response;
    const reviewText = response.text();

    if (!reviewText) {
      throw new Error('Gemini API returned an empty response.');
    }

    // 3. Post/Update comment on the PR
    core.info('Posting review comment to PR...');
    const comments = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    const botComment = comments.data.find(comment => comment.body.includes(BOT_IDENTIFIER));
    const finalCommentBody = `${reviewText}\n\n${BOT_IDENTIFIER}`;

    if (botComment) {
      core.info(`Found existing review comment (ID: ${botComment.id}). Updating it...`);
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: botComment.id,
        body: finalCommentBody,
      });
      core.info('Review comment updated successfully.');
    } else {
      core.info('No existing review comment found. Creating a new one...');
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: finalCommentBody,
      });
      core.info('Review comment created successfully.');
    }

  } catch (error) {
    core.error(error.stack || error.message);
    core.setFailed(`Auto PR Reviewer failed: ${error.message}`);
  }
}

run();
