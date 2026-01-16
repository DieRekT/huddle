import { spawn } from 'child_process';
import fs from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

function runFFmpeg(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`${cmd} exited ${code}: ${err}`));
    });
  });
}

// Converts input buffer (webm/ogg) into 16kHz mono WAV buffer
export async function convertToWav16kMono({ audioBuffer, ext }) {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), 'roombrief-'));
  const inPath = join(tmpDir, `in.${ext || 'webm'}`);
  const outPath = join(tmpDir, 'out.wav');

  try {
    await fs.writeFile(inPath, audioBuffer);

    // FFmpeg: single clean decode + resample to 16k mono PCM16 WAV.
    // IMPORTANT: default is **no filters**. Any denoise/normalization can destroy consonants for ASR.
    // Optional: set FFMPEG_AUDIO_FILTER to apply conservative filtering.
    // Example: FFMPEG_AUDIO_FILTER="highpass=f=80,lowpass=f=8000"
    const audioFilter = String(process.env.FFMPEG_AUDIO_FILTER || '').trim();

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-vn',
      '-i', inPath,
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      outPath
    ];
    if (audioFilter) {
      // Apply filter only when explicitly requested.
      args.splice(args.indexOf('-ac'), 0, '-af', audioFilter);
    }
    await runFFmpeg('ffmpeg', args);

    const wav = await fs.readFile(outPath);

    // Cleanup (best-effort)
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}

    return wav;
  } catch (error) {
    // Cleanup on error
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
    throw error;
  }
}


