import ffmpeg from 'fluent-ffmpeg'

export interface VideoEdits {
  cropRect?: { x: number; y: number; width: number; height: number }
  speed?: number
  removeAudio?: boolean
  trim?: { start: number; end: number }
}

export function hasVideoEdits(edits: VideoEdits): boolean {
  const hasTrim = !!edits.trim && (edits.trim.start > 0 || edits.trim.end > 0)
  return !!edits.cropRect || (!!edits.speed && edits.speed !== 1) || !!edits.removeAudio || hasTrim
}

/** atempo only supports 0.5-2.0 per filter, so chain filters for extreme speeds */
function atempoChain(speed: number): string[] {
  const filters: string[] = []
  let remaining = speed
  while (remaining > 2.0) {
    filters.push('atempo=2.0')
    remaining /= 2.0
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5')
    remaining /= 0.5
  }
  filters.push(`atempo=${remaining}`)
  return filters
}

/** Crop filter with H.264-friendly (even) dimensions */
function cropFilter(cropRect: NonNullable<VideoEdits['cropRect']>): string {
  const x = Math.round(cropRect.x)
  const y = Math.round(cropRect.y)
  const width = Math.round(cropRect.width / 2) * 2
  const height = Math.round(cropRect.height / 2) * 2
  return `crop=${width}:${height}:${x}:${y}`
}

function runCommand(cmd: ffmpeg.FfmpegCommand, output: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    cmd.output(output)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

/**
 * Renders a video's edits (trim, crop, speed, audio removal) from inputPath to outputPath (mp4).
 * intermediatePath is used when trim is combined with a speed change.
 */
export async function applyVideoEdits(
  inputPath: string,
  outputPath: string,
  intermediatePath: string,
  edits: VideoEdits
): Promise<void> {
  const { cropRect, speed, removeAudio, trim } = edits
  const hasTrim = !!trim && (trim.start > 0 || trim.end > 0)
  const effectiveSpeed = speed && speed !== 1 ? speed : null

  const applyTrim = (cmd: ffmpeg.FfmpegCommand) => {
    if (!trim) return
    if (trim.start > 0) {
      cmd.inputOptions(['-ss', String(trim.start)])
    }
    if (trim.end > 0) {
      const duration = trim.end - (trim.start || 0)
      if (duration > 0) {
        cmd.inputOptions(['-t', String(duration)])
      }
    }
  }

  // Use multi-pass approach when we have trim combined with crop or speed
  // This avoids synchronization issues between input seeking and video filters
  // Pass 1: crop + trim -> intermediate file (or output if no speed)
  // Pass 2: speed change -> output file (only if speed is needed)
  const needsTrimPass = hasTrim && (effectiveSpeed || cropRect)
  const needsSpeedPass = hasTrim && effectiveSpeed

  if (needsTrimPass) {
    // PASS 1: Crop and trim
    // Output to intermediate if we need speed pass, otherwise directly to output
    const cmd = ffmpeg(inputPath)
    applyTrim(cmd)
    if (cropRect) {
      cmd.videoFilter([cropFilter(cropRect)])
    }
    cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
    if (removeAudio) {
      cmd.noAudio()
    } else {
      cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
    }
    await runCommand(cmd, needsSpeedPass ? intermediatePath : outputPath)

    // PASS 2: Apply speed change (only if needed)
    if (needsSpeedPass && effectiveSpeed) {
      const cmd2 = ffmpeg(intermediatePath)
      cmd2.videoFilter([`setpts=PTS/${effectiveSpeed}`])
      if (!removeAudio) {
        cmd2.audioFilter(atempoChain(effectiveSpeed))
        cmd2.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
      } else {
        cmd2.noAudio()
      }
      cmd2.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
      await runCommand(cmd2, outputPath)
    }
    return
  }

  // Single pass: no trim, or no speed change
  const videoFilters: string[] = []
  const audioFilters: string[] = []
  if (cropRect) {
    videoFilters.push(cropFilter(cropRect))
  }
  if (effectiveSpeed) {
    videoFilters.push(`setpts=PTS/${effectiveSpeed}`)
    audioFilters.push(...atempoChain(effectiveSpeed))
  }

  const cmd = ffmpeg(inputPath)
  // Apply trim as input options for efficiency (seeks before decoding)
  if (hasTrim) applyTrim(cmd)
  if (videoFilters.length > 0) {
    cmd.videoFilter(videoFilters)
  }
  cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])

  // Handle audio: remove, re-encode for speed change, or copy
  if (removeAudio) {
    cmd.noAudio()
  } else if (audioFilters.length > 0 || hasTrim) {
    if (audioFilters.length > 0) {
      cmd.audioFilter(audioFilters)
    }
    cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
  } else {
    cmd.outputOptions(['-c:a', 'copy'])
  }
  await runCommand(cmd, outputPath)
}

export interface VideoProbe {
  width: number
  height: number
  duration: number
  fps: number
  hasAudio: boolean
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null
  const [num, den] = rate.split('/').map(Number)
  const fps = den ? num / den : num
  return Number.isFinite(fps) && fps > 0 ? fps : null
}

export function probeVideo(filePath: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)
      const video = metadata.streams.find((s) => s.codec_type === 'video')
      if (!video?.width || !video?.height) {
        return reject(new Error('Could not determine video dimensions'))
      }
      const duration = Number(metadata.format.duration ?? video.duration)
      resolve({
        width: video.width,
        height: video.height,
        duration: Number.isFinite(duration) ? duration : 0,
        fps: parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate) ?? 30,
        hasAudio: metadata.streams.some((s) => s.codec_type === 'audio'),
      })
    })
  })
}

/** Scales a video to exactly width×height (even dimensions for H.264). Audio is copied. */
export async function resizeVideo(inputPath: string, outputPath: string, width: number, height: number, nearest: boolean): Promise<void> {
  const cmd = ffmpeg(inputPath)
    .videoFilter([`scale=${width}:${height}:flags=${nearest ? 'neighbor' : 'lanczos'}`, 'setsar=1'])
    .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'copy'])
  await runCommand(cmd, outputPath)
}

export type ClipTransition = 'cut' | 'crossfade' | 'dip'

export interface ConcatClip {
  path: string
  probe: VideoProbe
}

/**
 * Builds the ffmpeg filter graph that appends clips with transitions between them.
 * Every clip is scaled to fit width×height (uniformly, up or down) and letterboxed with black.
 * Clips without audio get silence so audio stays continuous. Returns the graph, the output stream
 * labels, and the resulting duration.
 */
export function buildConcatFilterGraph(
  clips: ConcatClip[],
  transitions: ClipTransition[],
  transitionDuration: number,
  width: number,
  height: number,
  fps: number,
  scaleFlags: string
): { graph: string; outputs: string[]; duration: number } {
  const anyAudio = clips.some((c) => c.probe.hasAudio)
  const parts: string[] = []

  clips.forEach((clip, i) => {
    const d = clip.probe.duration
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=${scaleFlags},` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p,` +
      `trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`
    )
    if (anyAudio) {
      parts.push(clip.probe.hasAudio
        ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`)
    }
  })

  let vCur = 'v0'
  let aCur = 'a0'
  let length = clips[0].probe.duration
  for (let i = 1; i < clips.length; i++) {
    const vNext = `vx${i}`
    const aNext = `ax${i}`
    const d = clips[i].probe.duration
    const transition = transitions[i - 1] ?? 'cut'
    // A transition can't be longer than half of either clip
    const t = Math.min(transitionDuration, length / 2, d / 2)
    if (transition === 'cut' || t < 0.04) {
      parts.push(`[${vCur}][v${i}]concat=n=2:v=1:a=0[${vNext}]`)
      if (anyAudio) parts.push(`[${aCur}][a${i}]concat=n=2:v=0:a=1[${aNext}]`)
      length += d
    } else {
      const xfade = transition === 'dip' ? 'fadeblack' : 'fade'
      parts.push(`[${vCur}][v${i}]xfade=transition=${xfade}:duration=${t}:offset=${length - t}[${vNext}]`)
      if (anyAudio) parts.push(`[${aCur}][a${i}]acrossfade=d=${t}[${aNext}]`)
      length += d - t
    }
    vCur = vNext
    aCur = aNext
  }

  return { graph: parts.join(';'), outputs: anyAudio ? [vCur, aCur] : [vCur], duration: length }
}
