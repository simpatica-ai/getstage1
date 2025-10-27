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

    const { virtueName, virtueDef, characterDefectAnalysis, stage1MemoContent, previousPrompts } = req.body;

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
      - **Previous Prompts Given:** ${previousPrompts ? `"""${JSON.stringify(previousPrompts)}"""` : "No previous prompts for this virtue."}

      **CRITICAL ASSESSMENT:** First, analyze the user's writing progress against ALL character defects identified in the analysis. For each defect, determine if the user has adequately addressed it by examining whether they have described:
      1. The frequency/patterns of each defective behavior
      2. Who has been harmed by each defect
      3. The specific nature of that harm

      **DEFECT PROGRESSION LOGIC:** 
      - If the highest-scoring defect has been thoroughly explored (frequency, harm, impact described), move to the next highest-scoring unaddressed defect
      - If multiple defects remain unaddressed, prioritize by their impact on the virtue score
      - Only when ALL defects have been adequately explored should dismantling be considered complete

      **COMPLETION CHECK:** If ALL defects have been thoroughly explored with frequency, harm, and impact described, then acknowledge their completion of dismantling for this virtue and guide them toward readiness for the next stage.

      **CRITICAL FOCUS:** If dismantling is incomplete, prioritize the next unaddressed character defect by impact on virtue score. Focus on defects that have NOT been adequately explored yet, moving systematically through all defects that undermine ${virtueName}.

      **SPELLING AND GRAMMAR ARE VERY IMPORTANT.  Review all responses for spelling and grammar.

      **YOUR TASK:**
      Based on ALL the information above, generate a clear and direct writing prompt (limit 200 words). Your response MUST do the following:

      ${stage1MemoContent ? 
        `1. Acknowledge their existing writing progress briefly.
         2. Either: (a) If dismantling appears complete for ALL defects, congratulate them and suggest readiness for next stage, OR (b) Focus on the next highest-scoring unaddressed character defect.
         3. If incomplete, give SPECIFIC writing instructions about the next unaddressed defect: "Write about [specific defect behavior]. Describe how often you do this, who gets hurt when you do it, and exactly how they are harmed."` 
        : 
        `1. Briefly explain that dismantling means examining your harmful behaviors.
         2. Focus on the highest-scoring (most damaging) character defect that undermines ${virtueName}.
         3. Give CLEAR writing instructions: "Write about [specific defect behavior]. Describe: How often do you do this? Who gets hurt when you do it? What specific harm do they experience?"`}

      4. End with 2-3 direct questions about specific behaviors, not general reflections.

      Be direct and clear about what to write. Avoid flowery language. Give specific writing topics and concrete questions. Format any numerical scores to 1 decimal place (e.g., 5.6/10, not 5.57/10).
    `;

    // --- Model Execution Logic (Unchanged) ---
    // Use gemini-2.5-flash-lite as primary, with fallbacks
    const modelNames = [
      'gemini-2.5-flash-lite',  // Primary model
      'gemini-2.0-flash-lite',  // Fallback 1
      'gemini-1.5-flash-lite',  // Fallback 2
      'gemini-1.5-flash',       // Fallback 3
      'gemini-pro'              // Final fallback
    ];
    let promptResponseText = '';
    let successfulModel = '';

    for (const modelName of modelNames) {
      try {
        console.log(`Trying model: ${modelName}`);
        const generativeModel = vertex_ai.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.3, // Reduced for more focused, clear responses
            topP: 0.8,
            topK: 40
          }
        });
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
