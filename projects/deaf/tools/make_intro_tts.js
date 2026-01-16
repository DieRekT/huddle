#!/usr/bin/env node
/**
 * Generate intro narration audio using OpenAI TTS
 * 
 * Usage:
 *   node tools/make_intro_tts.js
 * 
 * Requires:
 *   - OPENAI_API_KEY in .env file
 *   - Creates public/assets/intro.mp3
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFile } from 'fs/promises';
import OpenAI from 'openai';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const NARRATION_TEXT = `Welcome to Huddle! The revolutionary way to read any room — live and in real time. Here's how it works: Create your room in seconds and get a unique code to share. Your friends simply scan the QR code on any phone or tablet, and boom — they're instantly connected. Watch as conversations come alive: topics emerge, key points pop up, next steps appear, and a live transcript streams automatically. Feeling ready to jump in? Just tap the mic button anytime. It's that simple. Huddle gives you complete control, keeping you connected and in the loop, wherever you are. Ready to transform how you experience every conversation? Let's dive in!`;

async function generateIntroAudio() {
  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in .env file');
    console.error('Please add your OpenAI API key to .env file');
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  console.log('Generating intro narration audio...');
  console.log('Text:', NARRATION_TEXT);

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'shimmer', // Options: alloy, echo, fable, onyx, nova, shimmer (shimmer = most energetic and expressive)
      input: NARRATION_TEXT,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const outputPath = join(projectRoot, 'public', 'assets', 'intro.mp3');

    // Ensure assets directory exists
    const { mkdir } = await import('fs/promises');
    await mkdir(join(projectRoot, 'public', 'assets'), { recursive: true });

    await writeFile(outputPath, buffer);

    console.log(`✅ Audio generated successfully!`);
    console.log(`   Output: ${outputPath}`);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    // Get audio duration estimate (rough)
    const duration = buffer.length / 16000; // Rough estimate for MP3
    console.log(`   Duration: ~${duration.toFixed(1)}s (estimate)`);
  } catch (error) {
    console.error('Error generating audio:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.status, error.response.statusText);
    }
    process.exit(1);
  }
}

generateIntroAudio().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

