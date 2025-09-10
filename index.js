const { VertexAI } = require('@google-cloud/vertexai');
const functions = require('@google-cloud/functions-framework');

// Initialize Vertex AI outside the handler for better performance
const vertex_ai = new VertexAI({
  project: 'new-man-app',
  location: 'us-central1'
});

functions.http('getstage1', async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).send({ error: 'Invalid request body' });
    }

    const { virtueName, virtueDef, characterDefectAnalysis, stage1MemoContent } = req.body;

    // Validate required fields
    if (!virtueName || !virtueDef || !characterDefectAnalysis) {
      return res.status(400).send({ error: 'Missing required fields: virtueName, virtueDef, and characterDefectAnalysis are required.' });
    }

    // --- NEW STAGE 1 PROMPT ---
    const prompt = `
      You are an empathetic and wise recovery coach. Your task is to generate a motivating, introspective, and contextually aware writing prompt for a user working on Stage 1 of their virtue development, which is "Dismantling". Dismantling is not a friendly process, and inviting brutal honesty is key. Empathy is offered as we are more than our mistakes.

      **Objective of Dismantling:** Dismantling is the introspective practice of recognizing one's inner flaws (character defects), acknowledging the harm they cause, and making a resolute commitment to actively cease acting upon them.

      **USER CONTEXT:**
      - **Virtue:** ${virtueName}
      - **Virtue Definition:** ${virtueDef}
      - **AI Analysis of User's Character Defects:** "${characterDefectAnalysis}"
      - **User's Writing Progress on Stage 1 So Far:** """${stage1MemoContent || "The user has not started writing for this stage yet."}"""

      **YOUR TASK:**
      Based on ALL the information above, generate a thoughtful and encouraging prompt of about 250 words. Your response MUST do the following:
      1.  Acknowledge the user's current position in their journey with this virtue, referencing the provided AI analysis of their character defects.
      2.  If the user has already written something, briefly acknowledge their progress and insights.
      3.  Gently guide their focus toward a specific character defect mentioned in the analysis. Explain how this specific defect acts as a barrier to practicing the virtue of ${virtueName}.
      4.  Conclude with a direct, open-ended question or a reflective task. This should encourage the user to explore a specific memory, feeling, or pattern of behavior related to that defect. The goal is to help them see the defect clearly without judgment.

      Frame your response with empathy and wisdom. You are a trusted companion on their journey of self-discovery and growth. Refer to the user as "you".
    `;

    // --- Model Execution Logic (Unchanged) ---
    const modelNames = ['gemini-1.5-flash', 'gemini-pro']; // Simplified model list for clarity
    let promptResponseText = '';
    let successfulModel = '';

    for (const modelName of modelNames) {
      try {
        console.log(`Trying model: ${modelName}`);
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;

        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
          promptResponseText = response.candidates[0].content.parts[0].text;
          successfulModel = modelName;
          console.log(`Success with model: ${modelName}`);
          break;
        } else {
          throw new Error('Invalid response format from model');
        }
      } catch (error) {
        console.warn(`Model ${modelName} failed:`, error.message);
        continue;
      }
    }

    if (!promptResponseText) {
      console.error('All models failed.');
      // A simple fallback if all AI models fail
      promptResponseText = `Take a quiet moment to reflect on the virtue of ${virtueName}. Consider one specific time this week where you found it challenging to practice. What was the situation? What feelings came up for you? Gently explore this memory without judgment.`;
    }

    res.status(200).send({
      prompt: promptResponseText,
      model: successfulModel || 'fallback'
    });

  } catch (error) {
    console.error('Unexpected error in getstage1 function:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});
