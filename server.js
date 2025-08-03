// server.js - Combined Enhanced Email Analysis + Login + iFrame Navigation

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'nra-portal-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Simple user store (in production, use a database)
const users = {
    'admin': 'password', // Change these!
    'user': 'user123'
};

// Helper function to extract text from HTML
function extractTextFromHTML(html) {
    let text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    
    return text;
}

// Load the enhanced email data
let emailData = null;
try {
    const fs = require('fs');
    
    if (fs.existsSync('./enhanced_email_analysis.json')) {
        const enhancedData = fs.readFileSync('./enhanced_email_analysis.json', 'utf8');
        emailData = JSON.parse(enhancedData);
        console.log('✅ Loaded enhanced email analysis data');
    } else {
        console.log('⚠️  Enhanced data not found, loading original data');
        emailData = require('./LiveEmailData');
    }
} catch (error) {
    console.error('Error loading email data:', error);
    emailData = { emails: [], summary: {} };
}

// Login page HTML
const loginPage = `
<!DOCTYPE html>
<html>
<head>
    <title>President's Portal Login</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-image: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
        }
        
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            width: 400px;
            text-align: center;
        }
        
        .logo {
            font-size: 48px;
            color: #c41e3a;
            margin-bottom: 10px;
        }
        
        h2 {
            color: #333;
            margin-bottom: 30px;
            font-size: 24px;
        }
        
        .input-group {
            position: relative;
            margin-bottom: 20px;
            text-align: left;
        }
        
        .input-group i {
            position: absolute;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: #666;
        }
        
        input {
            width: 100%;
            padding: 12px 12px 12px 45px;
            border: 2px solid #e0e0e0;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #c41e3a;
        }
        
        button {
            width: 100%;
            padding: 12px;
            background: #c41e3a;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }
        
        button:hover {
            background: #a01729;
        }
        
        .error {
            color: #d32f2f;
            margin-top: 15px;
            padding: 10px;
            background: #ffebee;
            border-radius: 5px;
            font-size: 14px;
        }
        
        .footer {
            margin-top: 20px;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <i class="fas fa-bullseye logo"></i>
        <h2>President's Portal Login</h2>
        <form action="/login" method="POST">
            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" name="username" placeholder="Username" required autofocus>
            </div>
            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" name="password" placeholder="Password" required>
            </div>
            <button type="submit">Sign In</button>
        </form>
        {{ERROR}}
        <div class="footer">
            Secure Member Portal
        </div>
    </div>
</body>
</html>
`;

// Dashboard/Portal page with iframes
const portalPage = `
<!DOCTYPE html>
<html>
<head>
    <title>President's Portal Dashboard</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: #2c2c2c;
            color: white;
            padding: 0 20px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .logo-section {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .logo {
            font-size: 28px;
            color: #c41e3a;
        }
        
        .nav-menu {
            display: flex;
            gap: 5px;
            flex: 1;
            margin-left: 40px;
        }
        
        .nav-item {
            padding: 10px 20px;
            background: none;
            color: #ccc;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .nav-item:hover {
            background: #3c3c3c;
            color: white;
        }
        
        .nav-item.active {
            background: #c41e3a;
            color: white;
        }
        
        .user-section {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .username {
            font-size: 14px;
            color: #ccc;
        }
        
        .logout-btn {
            padding: 8px 16px;
            background: #c41e3a;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            transition: background 0.3s;
        }
        
        .logout-btn:hover {
            background: #a01729;
        }
        
        .content {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: none;
        }
        
        iframe.active {
            display: block;
        }
        
        .welcome-screen {
            padding: 40px;
            text-align: center;
            display: none;
        }
        
        .welcome-screen.active {
            display: block;
        }
        
        .welcome-screen h1 {
            color: #333;
            margin-bottom: 20px;
        }
        
        .welcome-screen p {
            color: #666;
            font-size: 18px;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
        }
        
        .app-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 40px;
            max-width: 1000px;
            margin-left: auto;
            margin-right: auto;
        }
        
        .app-card {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: transform 0.3s, box-shadow 0.3s;
            text-align: center;
        }
        
        .app-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        }
        
        .app-card i {
            font-size: 48px;
            color: #c41e3a;
            margin-bottom: 15px;
        }
        
        .app-card h3 {
            color: #333;
            margin-bottom: 10px;
        }
        
        .app-card p {
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-section">
            <i class="fas fa-bullseye logo"></i>
            <h1 style="font-size: 20px; font-weight: 600;">President's Portal</h1>
        </div>
        
        <nav class="nav-menu">
            <button class="nav-item active" onclick="showApp('home')">
                <i class="fas fa-home"></i> Home
            </button>
            <button class="nav-item" onclick="showApp('emails')">
                <i class="fas fa-envelope"></i> Email Analytics
            </button>
            <button class="nav-item" onclick="showApp('anythingllm')">
                <i class="fas fa-robot"></i> AnythingLLM
            </button>
            <button class="nav-item" onclick="showApp('analytics')">
                <i class="fas fa-chart-line"></i> Analytics
            </button>
            <button class="nav-item" onclick="showApp('members')">
                <i class="fas fa-users"></i> Members
            </button>
        </nav>
        
        <div class="user-section">
            <span class="username">
                <i class="fas fa-user-circle"></i> {{USERNAME}}
            </span>
            <a href="/logout" class="logout-btn">
                <i class="fas fa-sign-out-alt"></i> Logout
            </a>
        </div>
    </div>
    
    <div class="content">
        <div id="home" class="welcome-screen active">
            <h1>Welcome to the President's Portal</h1>
            <p>Select an application from the menu above or click on one of the cards below to get started.</p>
            
            <div class="app-grid">
                <div class="app-card" onclick="showApp('emails')">
                    <i class="fas fa-envelope"></i>
                    <h3>Email Analytics</h3>
                    <p>AI-powered email analysis and insights</p>
                </div>
                <div class="app-card" onclick="showApp('anythingllm')">
                    <i class="fas fa-robot"></i>
                    <h3>AnythingLLM</h3>
                    <p>AI assistant and document analysis</p>
                </div>
                <div class="app-card" onclick="showApp('analytics')">
                    <i class="fas fa-chart-line"></i>
                    <h3>Analytics Dashboard</h3>
                    <p>Data visualization and reports</p>
                </div>
                <div class="app-card" onclick="showApp('members')">
                    <i class="fas fa-users"></i>
                    <h3>Member Management</h3>
                    <p>Member database and communications</p>
                </div>
            </div>
        </div>
        
        <iframe id="emails" src="/cory.html"></iframe>
        <iframe id="anythingllm" 
                src="{{ANYTHINGLLM_URL}}"
                frameborder="0"
                style="width: 100%; height: 100%; border: none;"
                allow="clipboard-write; microphone">
        </iframe>
        <iframe id="analytics" src="/roi.html"></iframe>
        <iframe id="members" src="/members"></iframe>
    </div>
    
    <script>
        function showApp(appId) {
            // Hide all content
            document.querySelectorAll('iframe, .welcome-screen').forEach(el => {
                el.classList.remove('active');
            });
            
            // Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Show selected app
            document.getElementById(appId).classList.add('active');
            
            // Set active nav item
            event.currentTarget.classList.add('active');
        }
    </script>
</body>
</html>
`;

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Authentication Routes
app.get('/login', (req, res) => {
    res.send(loginPage.replace('{{ERROR}}', ''));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (users[username] && users[username] === password) {
        req.session.authenticated = true;
        req.session.username = username;
        res.redirect('/portal');
    } else {
        const errorMsg = '<div class="error"><i class="fas fa-exclamation-circle"></i> Invalid username or password</div>';
        res.send(loginPage.replace('{{ERROR}}', errorMsg));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Main portal page
app.get('/portal', requireAuth, (req, res) => {
    let html = portalPage.replace('{{USERNAME}}', req.session.username);
    const anythingLLMUrl = process.env.ANYTHINGLLM_URL || 'https://your-anythingllm-instance.com/embed';
    html = html.replace('{{ANYTHINGLLM_URL}}', anythingLLMUrl);
    res.send(html);
});

// Redirect root to portal
app.get('/', (req, res) => {
    res.redirect('/portal');
});

// Placeholder for members page
app.get('/members', requireAuth, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Members</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #f5f5f5;
                }
                .placeholder {
                    text-align: center;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="placeholder">
                <h1>Members Section</h1>
                <p>This section is under development</p>
            </div>
        </body>
        </html>
    `);
});

// Serve static files only for authenticated users
app.use('/public', requireAuth, express.static('public'));
app.use('/cory.html', requireAuth, express.static('public/cory.html'));
app.use('/roi.html', requireAuth, express.static('public/roi.html'));

// API Routes (protected)
app.get('/api/emails', requireAuth, (req, res) => {
    if (emailData.emails) {
        res.json({ 
            emails: emailData.emails,
            summary: emailData.summary 
        });
    } else {
        res.status(500).json({ error: 'Email data not loaded' });
    }
});

app.get('/api/stats', requireAuth, (req, res) => {
    if (emailData.summary) {
        const summary = emailData.summary;
        res.json({
            total: summary.overview?.total_analyzed || summary.statistics?.total_emails || 0,
            analyzed: summary.overview?.total_analyzed || summary.statistics?.analyzed || 0,
            failed: summary.statistics?.failed || 0,
            avgPriorityScore: summary.overview?.average_priority || summary.statistics?.avg_priority_score || 0,
            emailsRequiringAction: summary.overview?.requiring_response || summary.statistics?.emails_requiring_action || 0,
            sentiments: summary.distributions?.by_sentiment || summary.distributions?.sentiment || {},
            urgency: summary.distributions?.by_priority || summary.distributions?.urgency || {},
            topics: summary.distributions?.by_topic || summary.distributions?.topics || {},
            senderAnalysis: summary.sender_analysis || {},
            highPriorityItems: summary.high_impact_items || summary.high_priority_items || [],
            aiInsights: summary.ai_insights || {
                executive_summary: "AI insights not available",
                key_points: [],
                risks: [],
                opportunities: [],
                stakeholders: []
            }
        });
    } else {
        res.status(500).json({ error: 'Summary data not available' });
    }
});

app.get('/api/quick-views', requireAuth, (req, res) => {
    if (emailData.quick_views) {
        res.json(emailData.quick_views);
    } else {
        res.json({
            fires_to_put_out: [],
            quick_wins: [],
            retention_risks: [],
            positive_testimonials: [],
            needs_response_today: [],
            vip_communications: []
        });
    }
});

app.get('/api/emails/priority/:level', requireAuth, (req, res) => {
    const level = req.params.level;
    let filtered = [];
    
    if (level === 'high') {
        filtered = emailData.emails.filter(e => 
            e.analysis && e.analysis.priority_score >= 7
        );
    } else if (level === 'medium') {
        filtered = emailData.emails.filter(e => 
            e.analysis && e.analysis.priority_score >= 5 && e.analysis.priority_score < 7
        );
    } else if (level === 'low') {
        filtered = emailData.emails.filter(e => 
            e.analysis && e.analysis.priority_score < 5
        );
    }
    
    res.json({ emails: filtered });
});

app.get('/api/emails/sentiment/:sentiment', requireAuth, (req, res) => {
    const sentiment = req.params.sentiment;
    const filtered = emailData.emails.filter(e => {
        if (!e.analysis) return false;
        if (e.analysis.sentiment_category === sentiment) return true;
        const aiSentiment = e.analysis.sentiment?.ai_analysis?.overall_sentiment;
        const classification = e.analysis.sentiment?.classification;
        return aiSentiment === sentiment || classification === sentiment;
    });
    
    res.json({ emails: filtered });
});

app.get('/api/emails/response/:type', requireAuth, (req, res) => {
    const type = req.params.type;
    const filtered = emailData.emails.filter(e => 
        e.analysis && e.analysis.response_required === type
    );
    
    res.json({ emails: filtered });
});

app.get('/api/emails/topic/:category', requireAuth, (req, res) => {
    const category = req.params.category;
    const filtered = emailData.emails.filter(e => 
        e.analysis && e.analysis.topic_category === category
    );
    
    res.json({ emails: filtered });
});

app.get('/api/senders/:email', requireAuth, (req, res) => {
    const senderEmail = decodeURIComponent(req.params.email);
    if (emailData.summary && emailData.summary.sender_analysis && emailData.summary.sender_analysis[senderEmail]) {
        res.json(emailData.summary.sender_analysis[senderEmail]);
    } else {
        res.status(404).json({ error: 'Sender not found' });
    }
});

app.post('/api/chat', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.' 
            });
        }

        const highPriorityEmails = emailData.emails
            .filter(e => e.analysis && e.analysis.priority_score >= 7)
            .map(e => ({
                subject: e.subject,
                sender: e.sender,
                priority: e.analysis.priority_score,
                sentiment: e.analysis.sentiment_category,
                response_required: e.analysis.response_required,
                summary: e.analysis.summary
            }));

        const distributions = emailData.summary?.distributions || {};
        
        const emailContext = `You are analyzing emails from NRA members with enhanced AI analysis.
        
        Summary Statistics:
        - Total emails: ${emailData.summary?.overview?.total_analyzed || 0}
        - Average priority score: ${emailData.summary?.overview?.average_priority || 0}
        - Emails requiring response: ${emailData.summary?.overview?.requiring_response || 0}
        
        Sentiment Distribution:
        ${Object.entries(distributions.by_sentiment || {})
            .map(([sentiment, count]) => `- ${sentiment}: ${count}`)
            .join('\n')}
        
        Priority Distribution:
        ${Object.entries(distributions.by_priority || {})
            .map(([priority, count]) => `- ${priority}: ${count}`)
            .join('\n')}
        
        Topic Categories:
        ${Object.entries(distributions.by_topic || {})
            .map(([topic, count]) => `- ${topic}: ${count}`)
            .join('\n')}
        
        High Priority Emails (7+):
        ${highPriorityEmails.map(e => 
            `- "${e.subject}" from ${e.sender} (Priority: ${e.priority.toFixed(1)}, ${e.sentiment}, Response: ${e.response_required}) - ${e.summary}`
        ).join('\n')}
        
        Quick Views Summary:
        - Fires to Put Out: ${emailData.quick_views?.fires_to_put_out?.length || 0} critical issues
        - Quick Wins: ${emailData.quick_views?.quick_wins?.length || 0} easy responses
        - Retention Risks: ${emailData.quick_views?.retention_risks?.length || 0} cancellation threats
        - Positive Testimonials: ${emailData.quick_views?.positive_testimonials?.length || 0} success stories
        
        Please provide helpful, specific analysis based on this enhanced analysis when answering questions.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: emailContext
                },
                {
                    role: "user",
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        res.json({ 
            response: completion.choices[0].message.content 
        });

    } catch (error) {
        console.error('OpenAI API Error:', error);
        res.status(500).json({ 
            error: 'Failed to get AI response. Please check your OpenAI API key.' 
        });
    }
});

app.get('/api/action-items', requireAuth, (req, res) => {
    const actionItems = [];
    
    emailData.emails.forEach(email => {
        if (email.analysis && email.analysis.action_items && email.analysis.action_items.length > 0) {
            email.analysis.action_items.forEach(item => {
                actionItems.push({
                    emailSubject: email.subject,
                    emailSender: email.sender,
                    emailId: email.id || emailData.emails.indexOf(email),
                    action: item.action,
                    priority: item.priority,
                    type: item.type || 'general',
                    deadline: email.analysis.response_deadline || item.deadline
                });
            });
        }
    });
    
    actionItems.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return 0;
    });
    
    res.json({ actionItems });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured',
        dataLoaded: emailData ? 'yes' : 'no',
        emailCount: emailData?.emails?.length || 0,
        enhancedAnalysis: emailData?.emails?.[0]?.analysis?.sentiment_category ? 'yes' : 'no'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🎯 NRA Portal Server running on http://localhost:${PORT}`);
    console.log(`📊 Portal available at http://localhost:${PORT}/portal`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  Warning: OPENAI_API_KEY not found in environment variables');
        console.warn('   AI chat features will not work without it');
    } else {
        console.log('✅ OpenAI API key configured');
    }
    
    if (emailData && emailData.summary) {
        console.log(`📧 Loaded ${emailData.emails?.length || 0} emails with enhanced AI analysis`);
        console.log(`⚡ Average priority score: ${emailData.summary.overview?.average_priority || 0}`);
        console.log(`🎯 Emails requiring action: ${emailData.summary.overview?.requiring_response || 0}`);
        console.log(`🔥 Critical issues: ${emailData.summary.overview?.critical_issues || 0}`);
        
        if (emailData.quick_views) {
            console.log('\n📋 Quick Views:');
            console.log(`  🔥 Fires to Put Out: ${emailData.quick_views.fires_to_put_out?.length || 0}`);
            console.log(`  ✅ Quick Wins: ${emailData.quick_views.quick_wins?.length || 0}`);
            console.log(`  ⚠️  Retention Risks: ${emailData.quick_views.retention_risks?.length || 0}`);
            console.log(`  👍 Positive Testimonials: ${emailData.quick_views.positive_testimonials?.length || 0}`);
        }
    }
});

// Updated package.json dependencies needed:
/*
{
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "cors": "^2.8.5",
    "openai": "^4.0.0",
    "dotenv": "^16.0.3"
  }
}
*/