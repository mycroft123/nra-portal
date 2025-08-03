// server.js - Updated for Enhanced Email Analysis

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
    // Try to load the enhanced analysis data
    const fs = require('fs');
    
    // First try to load enhanced data
    if (fs.existsSync('./enhanced_email_analysis.json')) {
        const enhancedData = fs.readFileSync('./enhanced_email_analysis.json', 'utf8');
        emailData = JSON.parse(enhancedData);
        console.log('✅ Loaded enhanced email analysis data');
    } else {
        // Fallback to original data
        console.log('⚠️  Enhanced data not found, loading original data');
        emailData = require('./LiveEmailData');
    }
} catch (error) {
    console.error('Error loading email data:', error);
    emailData = { emails: [], summary: {} };
}

// Routes
app.get('/api/emails', (req, res) => {
    if (emailData.emails) {
        res.json({ 
            emails: emailData.emails,
            summary: emailData.summary 
        });
    } else {
        res.status(500).json({ error: 'Email data not loaded' });
    }
});

app.get('/api/stats', (req, res) => {
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

// Get quick views - NEW ENDPOINT
app.get('/api/quick-views', (req, res) => {
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

// Get high priority emails
app.get('/api/emails/priority/:level', (req, res) => {
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

// Get emails by enhanced sentiment categories
app.get('/api/emails/sentiment/:sentiment', (req, res) => {
    const sentiment = req.params.sentiment;
    const filtered = emailData.emails.filter(e => {
        if (!e.analysis) return false;
        
        // Check new sentiment_category field
        if (e.analysis.sentiment_category === sentiment) return true;
        
        // Fallback to old structure
        const aiSentiment = e.analysis.sentiment?.ai_analysis?.overall_sentiment;
        const classification = e.analysis.sentiment?.classification;
        return aiSentiment === sentiment || classification === sentiment;
    });
    
    res.json({ emails: filtered });
});

// Get emails by response requirement
app.get('/api/emails/response/:type', (req, res) => {
    const type = req.params.type;
    const filtered = emailData.emails.filter(e => 
        e.analysis && e.analysis.response_required === type
    );
    
    res.json({ emails: filtered });
});

// Get emails by topic category
app.get('/api/emails/topic/:category', (req, res) => {
    const category = req.params.category;
    const filtered = emailData.emails.filter(e => 
        e.analysis && e.analysis.topic_category === category
    );
    
    res.json({ emails: filtered });
});

// Get sender insights
app.get('/api/senders/:email', (req, res) => {
    const senderEmail = decodeURIComponent(req.params.email);
    if (emailData.summary && emailData.summary.sender_analysis && emailData.summary.sender_analysis[senderEmail]) {
        res.json(emailData.summary.sender_analysis[senderEmail]);
    } else {
        res.status(404).json({ error: 'Sender not found' });
    }
});

// OpenAI Chat endpoint with enhanced context
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ 
                error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.' 
            });
        }

        // Create enhanced context with new analysis data
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

// Get action items with enhanced data
app.get('/api/action-items', (req, res) => {
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
    
    // Sort by priority (high -> medium -> low) and deadline
    actionItems.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return 0;
    });
    
    res.json({ actionItems });
});

// Health check
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
    console.log(`🎯 NRA Email Analysis Server (Enhanced) running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
    
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
        
        // Show quick views summary
        if (emailData.quick_views) {
            console.log('\n📋 Quick Views:');
            console.log(`  🔥 Fires to Put Out: ${emailData.quick_views.fires_to_put_out?.length || 0}`);
            console.log(`  ✅ Quick Wins: ${emailData.quick_views.quick_wins?.length || 0}`);
            console.log(`  ⚠️  Retention Risks: ${emailData.quick_views.retention_risks?.length || 0}`);
            console.log(`  👍 Positive Testimonials: ${emailData.quick_views.positive_testimonials?.length || 0}`);
        }
    }
});