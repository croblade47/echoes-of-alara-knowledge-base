# ============================================================================
# ECHOES OF ALARA - GITHUB PUSH HELPER & COPILOT LAUNCHER
# ============================================================================
# This script helps you push to GitHub and get Copilot assistance
# ============================================================================

$ErrorActionPreference = "SilentlyContinue"

Write-Host @"

╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║     🌌 ECHOES OF ALARA - GITHUB PUSH HELPER                     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Configuration
$KnowledgeBasePath = "$HOME\Documents\echoes-of-alara-knowledge-base"
$GitHubUsername = "croblade47"
$RepoName = "echoes-of-alara-knowledge-base"
$GitHubUrl = "https://github.com/$GitHubUsername/$RepoName"

# ============================================================================
# STEP 1: VERIFY GIT CONFIGURATION
# ============================================================================

Write-Host "`n━━━ STEP 1: Verifying Git Setup ━━━`n" -ForegroundColor Yellow

try {
    $gitVersion = git --version
    Write-Host "✓ Git installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Git not found! Please install from https://git-scm.com/" -ForegroundColor Red
    pause
    exit
}

$userName = git config --global user.name
$userEmail = git config --global user.email
$defaultBranch = git config --global init.defaultBranch

if ($userName -and $userEmail) {
    Write-Host "✓ Git configured:" -ForegroundColor Green
    Write-Host "  - Name: $userName" -ForegroundColor Gray
    Write-Host "  - Email: $userEmail" -ForegroundColor Gray
    Write-Host "  - Branch: $defaultBranch" -ForegroundColor Gray
} else {
    Write-Host "⚠ Git not configured. Configuring now..." -ForegroundColor Yellow
    git config --global user.name "croblade47"
    git config --global user.email "garrettgauthier44@gmail.com"
    git config --global init.defaultBranch main
    Write-Host "✓ Git configured successfully!" -ForegroundColor Green
}

# ============================================================================
# STEP 2: CHECK KNOWLEDGE BASE
# ============================================================================

Write-Host "`n━━━ STEP 2: Checking Knowledge Base ━━━`n" -ForegroundColor Yellow

if (Test-Path $KnowledgeBasePath) {
    Write-Host "✓ Knowledge base found at:" -ForegroundColor Green
    Write-Host "  $KnowledgeBasePath" -ForegroundColor Gray
    
    $fileCount = (Get-ChildItem -Path $KnowledgeBasePath -Recurse -File).Count
    Write-Host "✓ Contains $fileCount files" -ForegroundColor Green
} else {
    Write-Host "✗ Knowledge base not found!" -ForegroundColor Red
    Write-Host "  Expected location: $KnowledgeBasePath" -ForegroundColor Gray
    pause
    exit
}

# ============================================================================
# STEP 3: GIT STATUS CHECK
# ============================================================================

Write-Host "`n━━━ STEP 3: Checking Git Status ━━━`n" -ForegroundColor Yellow

Set-Location $KnowledgeBasePath

if (Test-Path ".git") {
    Write-Host "✓ Git repository initialized" -ForegroundColor Green
    
    $status = git status --porcelain
    if ($status) {
        Write-Host "⚠ Uncommitted changes found" -ForegroundColor Yellow
    } else {
        Write-Host "✓ All changes committed" -ForegroundColor Green
    }
    
    $remotes = git remote -v
    if ($remotes -match "origin") {
        Write-Host "✓ GitHub remote configured" -ForegroundColor Green
    } else {
        Write-Host "⚠ GitHub remote not configured" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ Git not initialized in this folder" -ForegroundColor Yellow
}

# ============================================================================
# STEP 4: INTERACTIVE MENU
# ============================================================================

Write-Host "`n━━━ STEP 4: What would you like to do? ━━━`n" -ForegroundColor Yellow

Write-Host "1. ✓ Initialize Git and commit all files" -ForegroundColor White
Write-Host "2. 🔗 Connect to GitHub (add remote)" -ForegroundColor White
Write-Host "3. 🚀 Push to GitHub now" -ForegroundColor White
Write-Host "4. 🌐 Open GitHub repository in browser" -ForegroundColor White
Write-Host "5. 💻 Open VS Code with this folder" -ForegroundColor White
Write-Host "6. 🤖 Open GitHub Copilot with helper prompt" -ForegroundColor White
Write-Host "7. 🎯 Do everything (Full automation)" -ForegroundColor Cyan
Write-Host "8. ❌ Exit" -ForegroundColor Gray

$choice = Read-Host "`nEnter your choice (1-8)"

switch ($choice) {
    "1" {
        Write-Host "`n🔧 Initializing Git and committing..." -ForegroundColor Cyan
        if (-not (Test-Path ".git")) { git init }
        git add .
        git commit -m "Initial commit: Echoes of Alara Knowledge Base v4.0

- Created semantic folder structure (00-10 sections)
- Migrated content from v4 Documentation and Context Library
- Added AI retrieval guide for Claude, Copilot, Gemini
- Single source of truth for all development"
        Write-Host "✓ Files committed!" -ForegroundColor Green
    }
    
    "2" {
        Write-Host "`n🔗 Adding GitHub remote..." -ForegroundColor Cyan
        git remote add origin $GitHubUrl 2>$null
        if ($?) {
            Write-Host "✓ Remote added!" -ForegroundColor Green
        } else {
            Write-Host "⚠ Remote may already exist" -ForegroundColor Yellow
        }
        git remote -v
    }
    
    "3" {
        Write-Host "`n🚀 Pushing to GitHub..." -ForegroundColor Cyan
        Write-Host "You may be prompted to sign in..." -ForegroundColor Yellow
        git push -u origin main
        if ($?) {
            Write-Host "`n✓ Successfully pushed to GitHub!" -ForegroundColor Green
            Write-Host "View at: $GitHubUrl" -ForegroundColor Cyan
        }
    }
    
    "4" {
        Write-Host "`n🌐 Opening GitHub in browser..." -ForegroundColor Cyan
        Start-Process $GitHubUrl
        Write-Host "✓ Browser opened!" -ForegroundColor Green
    }
    
    "5" {
        Write-Host "`n💻 Opening VS Code..." -ForegroundColor Cyan
        if (Get-Command code -ErrorAction SilentlyContinue) {
            code $KnowledgeBasePath
            Write-Host "✓ VS Code opened!" -ForegroundColor Green
        } else {
            Write-Host "⚠ VS Code not found. Opening folder instead..." -ForegroundColor Yellow
            Start-Process explorer.exe $KnowledgeBasePath
        }
    }
    
    "6" {
        Write-Host "`n🤖 Opening GitHub Copilot..." -ForegroundColor Cyan
        
        # Create prompt file
        $CopilotPrompt = @"
# TASK: Help me push my Echoes of Alara knowledge base to GitHub

## Context
I'm working on the Echoes of Alara project - an AI-powered therapeutic storytelling app. I've created a centralized knowledge base that needs to be pushed to GitHub.

## What I've Done
- Created folder structure at: $KnowledgeBasePath
- Organized documentation into 11 semantic sections (00_CONTEXT through 10_TEAM_OPERATIONS)
- Copied existing documentation from multiple sources
- Created README.md and AI_RETRIEVAL_GUIDE.md

## What I Need Help With
1. Verifying my Git setup is correct
2. Ensuring all files are committed properly
3. Pushing to GitHub repository: $GitHubUrl
4. Troubleshooting any authentication or push errors

## My GitHub Info
- Username: $GitHubUsername
- Repository: $RepoName
- Branch: main

## Questions
1. Is my Git configuration correct?
2. Are there any files I should exclude from the repository?
3. How do I handle authentication when pushing to GitHub?
4. How can I verify the push was successful?

Please guide me through this step-by-step.
"@
        
        Set-Content -Path "$KnowledgeBasePath\COPILOT_PROMPT.txt" -Value $CopilotPrompt
        Write-Host "✓ Created prompt file: COPILOT_PROMPT.txt" -ForegroundColor Green
        
        # Open GitHub Copilot
        Start-Process "https://github.com/copilot"
        
        # Open VS Code if available
        if (Get-Command code -ErrorAction SilentlyContinue) {
            code $KnowledgeBasePath
            Write-Host "✓ Opened VS Code - Look for COPILOT_PROMPT.txt" -ForegroundColor Green
        }
        
        Write-Host "`n📋 Copy the prompt from COPILOT_PROMPT.txt and paste into Copilot!" -ForegroundColor Yellow
    }
    
    "7" {
        Write-Host "`n🎯 FULL AUTOMATION MODE`n" -ForegroundColor Cyan
        
        # Step 1: Initialize and commit
        Write-Host "Step 1/5: Initializing Git..." -ForegroundColor Yellow
        if (-not (Test-Path ".git")) { git init }
        git add .
        git commit -m "Initial commit: Echoes of Alara Knowledge Base v4.0" 2>$null
        Write-Host "✓ Committed" -ForegroundColor Green
        
        # Step 2: Add remote
        Write-Host "Step 2/5: Adding GitHub remote..." -ForegroundColor Yellow
        git remote add origin $GitHubUrl 2>$null
        Write-Host "✓ Remote configured" -ForegroundColor Green
        
        # Step 3: Create Copilot prompt
        Write-Host "Step 3/5: Creating Copilot prompt..." -ForegroundColor Yellow
        $CopilotPrompt = @"
# GitHub Push Assistant - Echoes of Alara

I'm pushing my knowledge base to GitHub. Help me verify everything is correct!

Repository: $GitHubUrl
Local Path: $KnowledgeBasePath

Current status:
- Git initialized: $(Test-Path '.git')
- Files committed: Yes
- Remote configured: $(git remote -v)

Next: Push to GitHub with: git push -u origin main

If errors occur, please help me troubleshoot!
"@
        Set-Content -Path "$KnowledgeBasePath\COPILOT_PROMPT.txt" -Value $CopilotPrompt
        Write-Host "✓ Prompt created" -ForegroundColor Green
        
        # Step 4: Open everything
        Write-Host "Step 4/5: Opening browser and VS Code..." -ForegroundColor Yellow
        Start-Process $GitHubUrl
        if (Get-Command code -ErrorAction SilentlyContinue) {
            code $KnowledgeBasePath
        }
        Write-Host "✓ Opened" -ForegroundColor Green
        
        # Step 5: Push
        Write-Host "Step 5/5: Pushing to GitHub..." -ForegroundColor Yellow
        Write-Host "⚠ You may need to authenticate..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
        
        git push -u origin main
        
        if ($?) {
            Write-Host "`n╔══════════════════════════════════════╗" -ForegroundColor Green
            Write-Host "║  🎉 SUCCESS! Repository is live!    ║" -ForegroundColor Green
            Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
            Write-Host "`nView at: $GitHubUrl" -ForegroundColor Cyan
        } else {
            Write-Host "`n⚠ Push failed or requires authentication" -ForegroundColor Yellow
            Write-Host "Check the browser for sign-in prompts" -ForegroundColor Gray
        }
    }
    
    "8" {
        Write-Host "`nExiting..." -ForegroundColor Gray
        exit
    }
    
    default {
        Write-Host "`n⚠ Invalid choice" -ForegroundColor Red
    }
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
