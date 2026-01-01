const { VertexAI } = require('@google-cloud/vertexai');
const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');

// Initialize Vertex AI outside the handler for better performance
const vertex_ai = new VertexAI({
  project: 'new-man-app',
  location: 'us-central1'
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ixqkqzjmkfsqjqkqzjmk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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

    const { virtueName, virtueDef, characterDefectAnalysis, stage1MemoContent, previousPrompts, userId, virtueId } = req.body;

    // Validate required fields
    if (!virtueName || !virtueDef) {
      return res.status(400).send({ error: 'Missing required fields: virtueName and virtueDef are required.' });
    }

    // Fetch user's specific defect ratings for this virtue if userId is provided
    let specificDefects = [];
    if (userId && virtueId) {
      try {
        // Get the user's latest assessment
        const { data: latestAssessment } = await supabase
          .from('user_assessments')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (latestAssessment) {
          // Get defects mapped to this virtue with user's ratings
          const { data: defectData } = await supabase
            .from('defects_virtues')
            .select(`
              defects (
                id,
                name,
                definition
              )
            `)
            .eq('virtue_id', virtueId);

          if (defectData && defectData.length > 0) {
            const defectIds = defectData.map(d => d.defects.id);
            
            // Get user's ratings for these defects
            const { data: userRatings } = await supabase
              .from('user_assessment_defects')
              .select('defect_name, rating, harm_level')
              .eq('assessment_id', latestAssessment.id)
              .eq('user_id', userId);

            if (userRatings) {
              // Match defects with ratings and sort by rating (highest first)
              specificDefects = defectData
                .map(d => {
                  const rating = userRatings.find(r => r.defect_name === d.defects.name);
                  return {
                    name: d.defects.name,
                    definition: d.defects.definition,
                    rating: rating ? rating.rating : 0,
                    harmLevel: rating ? rating.harm_level : 'None'
                  };
                })
                .filter(d => d.rating > 0) // Only include defects with ratings
                .sort((a, b) => b.rating - a.rating); // Sort by rating, highest first
            }
          }
        }
      } catch (error) {
        console.warn('Could not fetch specific defect data:', error.message);
        // Continue with generic analysis if defect fetching fails
      }
    }

    // --- NEW STAGE 1 PROMPT ---
    const prompt = `
      You are an empathetic and wise recovery coach. Your task is to generate a motivating, introspective, and contextually aware writing prompt for a user working on Stage 1 of their virtue development, which is "Dismantling". Dismantling is not a friendly process, and inviting brutal honesty is key. Empathy is offered as we are more than our mistakes.

      **Objective of Dismantling:** Dismantling is the introspective practice of recognizing one's inner flaws (character defects), acknowledging the harm they cause, and making a resolute commitment to actively cease acting upon them.

      **USER CONTEXT:**
      - **Virtue:** ${virtueName}
      - **Virtue Definition:** ${virtueDef}
      - **User's Writing Progress on Stage 1 So Far:** """${stage1MemoContent || "The user has not started writing for this stage yet."}"""
      
      **SPECIFIC DEFECTS FOR THIS VIRTUE (from user's assessment, ordered by severity):**
      ${specificDefects.length > 0 ? 
        specificDefects.map((defect, index) => 
          `${index + 1}. **${defect.name}** (Rating: ${defect.rating}/10, Harm Level: ${defect.harmLevel})
             Definition: ${defect.definition || 'No definition available'}`
        ).join('\n      ') 
        : 
        `No specific defect data available. Use general analysis: "${characterDefectAnalysis || 'No character defect analysis available.'}"`
      }

      **CRITICAL ASSESSMENT:** Analyze the user's writing progress against the specific defects listed above. For each defect, determine if the user has adequately addressed it by examining whether they have described:
      1. The frequency/patterns of this specific defective behavior
      2. Who has been harmed by this specific defect
      3. The specific nature of that harm

      **DEFECT PROGRESSION LOGIC:** 
      ${specificDefects.length > 0 ? `
      - Start with the highest-rated defect: **${specificDefects[0]?.name}** (${specificDefects[0]?.rating}/10)
      - If that defect has been thoroughly explored, move to the next: **${specificDefects[1]?.name || 'No additional defects'}**
      - Work systematically through all ${specificDefects.length} defects in order of severity
      - Only when ALL defects have been adequately explored should dismantling be considered complete
      ` : `
      - Focus on the most significant character defects that undermine ${virtueName}
      - Work through each defect systematically
      `}

      **COMPLETION CHECK:** If ALL defects have been thoroughly explored with frequency, harm, and impact described, then acknowledge their completion of dismantling for this virtue and guide them toward readiness for the next stage.

      **SPELLING AND GRAMMAR ARE VERY IMPORTANT. Review all responses for spelling and grammar.**

      **YOUR TASK:**
      Based on ALL the information above, generate a clear and direct writing prompt (limit 200 words). Your response MUST do the following:

      ${stage1MemoContent ? 
        `1. Acknowledge their existing writing progress briefly.
         2. Either: (a) If dismantling appears complete for ALL defects, congratulate them and suggest readiness for next stage, OR (b) Focus on the next unaddressed defect from the list above.
         3. If incomplete, give SPECIFIC writing instructions about the next unaddressed defect: "Write about your pattern of [specific defect name]. Describe how often you engage in this behavior, who gets hurt when you do this, and exactly how they are harmed."` 
        : 
        `1. Briefly explain that dismantling means examining your harmful behaviors.
         2. Focus on the highest-rated defect from the assessment: ${specificDefects[0]?.name || 'the most significant character defect'}.
         3. Give CLEAR writing instructions: "Write about your pattern of [specific defect name]. Describe: How often do you engage in this behavior? Who gets hurt when you do this? What specific harm do they experience?"`}

      4. End with 2-3 direct questions about the specific defect behavior, not general reflections.
      5. Reference the defect's rating (e.g., "Your assessment showed this as a ${specificDefects[0]?.rating || 'significant'}/10 concern") to provide context.

      Be direct and clear about what to write. Avoid flowery language. Give specific writing topics and concrete questions about the actual defects from their assessment.
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
