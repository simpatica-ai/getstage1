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

    const { virtueName, virtueDef, characterDefectAnalysis, stage1MemoContent, specificDefects, previousPrompts, isStageComplete } = req.body;

    // Validate required fields
    if (!virtueName || !virtueDef) {
      return res.status(400).send({ error: 'Missing required fields: virtueName and virtueDef are required.' });
    }

    // If stage is marked complete, provide completion acknowledgment
    if (isStageComplete) {
      const completionPrompt = `
        Congratulations on completing Stage 2 (Dismantling) for ${virtueName}! 
        
        You have courageously examined your character defects and their impact on yourself and others. This honest self-reflection is a crucial foundation for growth.
        
        ${stage1MemoContent ? `
        **Your Reflection Summary:**
        You've written thoughtfully about your struggles with ${virtueName}, acknowledging specific patterns of harmful behavior and their consequences. This level of honesty and self-awareness demonstrates real commitment to change.
        ` : ''}
        
        **What's Next:**
        You're now ready to move to Stage 3 (Building), where you'll focus on developing positive habits and practices that embody ${virtueName}. This is where transformation begins - moving from recognizing what to stop doing, to actively practicing what to start doing.
        
        Take a moment to acknowledge the courage it took to complete this stage. You've done important work here.
      `;
      
      return res.status(200).send({
        prompt: completionPrompt.trim(),
        model: 'completion-acknowledgment',
        metadata: {
          defectFocus: null,
          isCompletionPrompt: true
        }
      });
    }

    // --- STAGE 2 PROMPT (Defect Reflection / Dismantling) ---
    const prompt = `
      You are an empathetic and wise recovery coach. Your task is to generate a motivating, introspective, and contextually aware writing prompt for a user working on Stage 2 of their virtue development, which is "Dismantling" (Defect Reflection). Dismantling is not a friendly process, and inviting brutal honesty is key. Empathy is offered as we are more than our mistakes.

      **Objective of Dismantling:** Dismantling is the introspective practice of recognizing one's inner flaws (character defects), acknowledging the harm they cause, and making a resolute commitment to actively cease acting upon them.

      **USER CONTEXT:**
      - **Virtue:** ${virtueName}
      - **Virtue Definition:** ${virtueDef}
      - **User's Writing Progress on Stage 2 So Far:** """${stage1MemoContent || "The user has not started writing for this stage yet."}"""
      
      **PREVIOUS PROMPTS GIVEN (to avoid repetition):**
      ${previousPrompts && previousPrompts.length > 0 ? 
        previousPrompts.map((p, i) => `${i + 1}. ${p.substring(0, 150)}...`).join('\n      ')
        : 'No previous prompts - this is the first guidance for this virtue.'}
      
      **SPECIFIC DEFECTS FOR THIS VIRTUE (from user's assessment, ordered by priority):**
      ${specificDefects && specificDefects.length > 0 ? 
        specificDefects.map((defect, index) => {
          const frequencyLabel = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'][defect.rating - 1] || 'Unknown';
          const harmLevel = defect.harmLevel || 'None';
          
          // Create a combined severity description
          let severityDescription = '';
          if (defect.rating >= 4 && (harmLevel === 'Severe' || harmLevel === 'Moderate')) {
            severityDescription = 'High Priority - Frequent and Harmful';
          } else if (defect.rating >= 4) {
            severityDescription = 'Moderate Priority - Very Frequent';
          } else if (harmLevel === 'Severe') {
            severityDescription = 'Moderate Priority - Highly Harmful';
          } else if (defect.rating >= 3 && harmLevel === 'Moderate') {
            severityDescription = 'Moderate Priority - Regular and Harmful';
          } else {
            severityDescription = 'Lower Priority - Less Frequent or Harmful';
          }
          
          return `${index + 1}. **${defect.name}** (${severityDescription})
             You engage in this behavior: ${frequencyLabel}
             Harm level to others: ${harmLevel}
             Definition: ${defect.definition || 'No definition available'}`;
        }).join('\n      ') 
        : 
        `No specific defect data available. Use general analysis: "${characterDefectAnalysis || 'No character defect analysis available.'}"`
      }

      **CRITICAL ASSESSMENT:** Carefully analyze the user's writing against EACH specific defect listed above. For each defect, determine if it has been adequately addressed by checking if the user has described:
      1. The frequency/patterns of this specific defective behavior (e.g., "I often lie to my spouse about...")
      2. Who has been harmed by this specific defect (e.g., "My wife, my children...")
      3. The specific nature of that harm (e.g., "They lost trust in me, felt betrayed...")
      
      **IMPORTANT:** A defect is only "addressed" if ALL THREE elements are present. Vague or general statements don't count.
      
      **DEFECT TRACKING:** Based on your analysis of their writing:
      - Identify which defects from the list above have been FULLY addressed (all 3 elements present)
      - Identify which defects have been PARTIALLY addressed (1-2 elements present)
      - Identify which defects have NOT been addressed at all
      - DO NOT ask about defects that are already fully addressed - move to the next unaddressed defect
      
      **AVOID REPETITION:** Review the previous prompts above. If you've already asked about a specific defect and the user has now addressed it, DO NOT ask about it again. Move to the next priority defect that hasn't been fully explored.

      **DEFECT PROGRESSION LOGIC:** 
      ${specificDefects && specificDefects.length > 0 ? `
      - Start with the highest priority defect: **${specificDefects[0]?.name}** (${['never engage in', 'rarely engage in', 'sometimes engage in', 'often engage in', 'always engage in'][specificDefects[0]?.rating - 1] || 'engage in'} this behavior with ${specificDefects[0]?.harmLevel || 'unknown'} harm to others)
      - If that defect has been thoroughly explored, move to the next: **${specificDefects[1]?.name || 'No additional defects'}**
      - Work systematically through all ${specificDefects.length} defects in order of priority
      - Only when ALL defects have been adequately explored should dismantling be considered complete
      ` : `
      - Focus on the most significant character defects that undermine ${virtueName}
      - Work through each defect systematically based on the general analysis provided
      `}

      **COMPLETION CHECK:** 
      - Count how many defects are FULLY addressed vs. total defects
      - If ALL defects with significant ratings (3+) have been thoroughly explored, acknowledge completion
      - If only minor defects (rating 1-2) remain unaddressed, consider dismantling complete
      - Provide a clear statement: "You have now addressed X of Y significant defects for ${virtueName}"
      - If 6 or more defects have been addressed, strongly consider completion
      
      **NEXT STEPS:**
      - If dismantling is complete: Congratulate them warmly and suggest they're ready for Stage 3 (Building). Say something like: "You have completed the dismantling phase for ${virtueName}. You've courageously examined [list the defects they addressed]. You're ready for Stage 3."
      - If defects remain: Focus ONLY on the highest-priority unaddressed defect - be specific about which one
      - Never circle back to defects already explored unless the user's writing was too vague
      - If the user has written about a defect in their current memo, DO NOT ask about it again

      **SPELLING AND GRAMMAR ARE VERY IMPORTANT. Review all responses for spelling and grammar.**

      **YOUR TASK:**
      Based on ALL the information above, generate a clear and direct writing prompt (limit 200 words). Your response MUST do the following:

      ${stage1MemoContent ? 
        `1. First, state which defects have been addressed and which remain (e.g., "You've thoroughly explored Lying and Deceit. Let's now focus on Manipulation.")
         2. Either: (a) If ALL significant defects are addressed, congratulate them: "You have completed the dismantling phase for ${virtueName}. You've courageously examined [list defects]. You're ready for Stage 2." OR (b) Focus on the NEXT highest-priority unaddressed defect.
         3. If incomplete, give SPECIFIC writing instructions about the next unaddressed defect: "Write about your pattern of [specific defect name]. Describe how often you engage in this behavior, who gets hurt when you do this, and exactly how they are harmed."
         4. DO NOT repeat questions about defects already thoroughly addressed in their writing.` 
        : 
        `1. Briefly explain that dismantling means examining your harmful behaviors.
         2. Focus on the highest-priority defect from the assessment: ${specificDefects && specificDefects[0]?.name || 'the most significant character defect'}.
         3. Give CLEAR writing instructions: "Write about your pattern of [specific defect name]. Describe: How often do you engage in this behavior? Who gets hurt when you do this? What specific harm do they experience?"`}

      4. End with 2-3 direct questions about the specific defect behavior, not general reflections.
      5. Reference the defect's assessment results using descriptive language (e.g., "Your assessment showed you often engage in this behavior, causing moderate harm to others") to provide meaningful context.

      Be direct and clear about what to write. Avoid flowery language. Give specific writing topics and concrete questions about the actual defects from their assessment.
    `;

    // --- Model Execution Logic (Unchanged) ---
    // Use latest Gemini models with fallbacks
    const modelNames = [
      'gemini-2.5-flash-lite',  // Primary model - proven stable
      'gemini-2.5-flash',       // Fallback 1 - faster, more capable
      'gemini-2.5-pro',         // Fallback 2 - highest capability
      'gemini-2.0-flash',       // Fallback 3 - cost-effective
      'gemini-2.0-flash-lite',  // Fallback 4 - ultra-efficient
      'gemini-1.5-flash',       // Fallback 5 - legacy stable
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

    // Determine which defect the AI is focusing on by analyzing the prompt text
    let focusedDefect = null;
    if (specificDefects && specificDefects.length > 0) {
      // Check which defect name appears in the prompt (case-insensitive)
      for (const defect of specificDefects) {
        const defectPattern = new RegExp(`\\b${defect.name}\\b`, 'i');
        if (defectPattern.test(promptResponseText)) {
          focusedDefect = defect.name;
          break; // Use the first match found
        }
      }
      // If no specific defect found, default to first unaddressed one
      if (!focusedDefect) {
        focusedDefect = specificDefects[0]?.name;
      }
    }

    // Enhanced completion detection
    const completionPhrases = [
      'completed the dismantling',
      'ready for stage 2',
      'ready for the next stage',
      'completed dismantling',
      'finished exploring',
      'addressed all',
      'thoroughly examined all',
      'courageously examined'
    ];
    const isCompletionPrompt = completionPhrases.some(phrase => 
      promptResponseText.toLowerCase().includes(phrase)
    );

    res.status(200).send({
      prompt: promptResponseText,
      model: successfulModel || 'fallback',
      metadata: {
        defectFocus: focusedDefect,
        isCompletionPrompt: isCompletionPrompt
      }
    });

  } catch (error) {
    console.error('Unexpected error in getstage1 function:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});
