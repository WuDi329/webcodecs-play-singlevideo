// import { VIDEO_STREAM_TYPE } from "./pull_demuxer_base.js";
// import { MP4PullDemuxer } from "../mp4_pull_demuxer.js";

const VIDEO_STREAM_TYPE = 1;
const AUDIO_STREAM_TYPE = 0;
const FRAME_BUFFER_TARGET_SIZE = 3;
const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING)
    return;
  console.debug(msg);
}

// Controls demuxing and decoding of the video track, as well as rendering
// VideoFrames to canvas. Maintains a buffer of FRAME_BUFFER_TARGET_SIZE
// decoded frames for future rendering.
//控制了解复用和对视频轨道的解码
export class VideoRenderer {
  async initialize(demuxer, canvas) {
    this.frameBuffer = [];
    //是否在fillinprogress，默认是false
    this.fillInProgress = false;

    this.demuxer = demuxer;
    //根据VIDEO_STREAM_TYPE进行初始化，这里进行了demuxer的初始化
    await this.demuxer.initialize(VIDEO_STREAM_TYPE);
    const config = this.demuxer.getDecoderConfig();
    console.log(config);

    this.canvas = canvas;
    this.canvas.width = config.displayWidth;
    this.canvas.height = config.displayHeight;
    this.canvasCtx = canvas.getContext('2d');

    this.decoder = new VideoDecoder({
      //每进来一个frame，将其缓存进frameBuffer中
      output: this.bufferFrame.bind(this),
      error: e => console.error(e),
    });
    console.assert(VideoDecoder.isConfigSupported(config))
    this.decoder.configure(config);
    console.log("decoder configured finished")

    this.init_resolver = null;
    let promise = new Promise((resolver) => this.init_resolver = resolver );

    //初始化之后进行fillFrameBuffer
    this.fillFrameBuffer();
    console.log("finish fillFrameBuffer")
    return promise;
  }

  render(timestamp) {
    debugLog('render(%d)', timestamp);
    let frame = this.chooseFrame(timestamp);
    //每次choose过后，重新填充fillFrameBuffer
    this.fillFrameBuffer();

    //如果获得的frame是null，代表framebuffer里面没有frame
    if (frame == null) {
      console.warn('VideoRenderer.render(): no frame ');
      return;
    }

    this.paint(frame);
  }

  //传入时间戳，返回距离其时间最近的frame
  chooseFrame(timestamp) {
    if (this.frameBuffer.length == 0)
      return null;

    let minTimeDelta = Number.MAX_VALUE;
    let frameIndex = -1;

    for (let i = 0; i < this.frameBuffer.length; i++) {
      //计算传入的timestamp和buffer中每一个frame的timestamp的绝对值
      let time_delta = Math.abs(timestamp - this.frameBuffer[i].timestamp);
      if (time_delta < minTimeDelta) {
        minTimeDelta = time_delta;
        frameIndex = i;
      } else {
        break;
      }
    }

    //确保不是-1
    console.assert(frameIndex != -1);

    if (frameIndex > 0)
    //丢弃x个陈旧的frame
      debugLog('dropping %d stale frames', frameIndex);

    for (let i = 0; i < frameIndex; i++) {
      //直到frameIndex之前的所有frame都被丢弃，然后close
      let staleFrame = this.frameBuffer.shift();
      staleFrame.close();
    }

    let chosenFrame = this.frameBuffer[0];
    debugLog('frame time delta = %dms (%d vs %d)', minTimeDelta/1000, timestamp, chosenFrame.timestamp)
    return chosenFrame;
  }

  //填充framebuffer
  async fillFrameBuffer() {
    if (this.frameBufferFull()) {
      debugLog('frame buffer full');

      //当init_resolver不为空了
      if (this.init_resolver) {
        //执行init_resolver
        this.init_resolver();
        this.init_resolver = null;
      }

      return;
    }

    // This method can be called from multiple places and we some may already
    // be awaiting a demuxer read (only one read allowed at a time).
    //这个方法可以从多个地方调用，有时可能已经在等待demuxer读取（一次只允许一个读取）。
    //fillinprogress是控制并发的
    if (this.fillInProgress) {
      return false;
    }
    this.fillInProgress = true;

    //当已经buffer的frame和decoded序列长度都小于FRAME_BUFFER_TARGET_SIZE（3）时，就会进行getNextChunk，并且decode
    while (this.frameBuffer.length < FRAME_BUFFER_TARGET_SIZE &&
            this.decoder.decodeQueueSize < FRAME_BUFFER_TARGET_SIZE) {
              //由demuxer来控制是否获取下一个chunk
      let chunk = await this.demuxer.getNextChunk();
      this.decoder.decode(chunk);
    }

    this.fillInProgress = false;

    // Give decoder a chance to work, see if we saturated the pipeline.
    setTimeout(this.fillFrameBuffer.bind(this), 0);
  }

  //判断frame是否满
  frameBufferFull() {
    return this.frameBuffer.length >= FRAME_BUFFER_TARGET_SIZE;
  }

  //将frame buffer起来
  bufferFrame(frame) {
    debugLog(`bufferFrame(${frame.timestamp})`);
    this.frameBuffer.push(frame);
  }

  //将frame渲染
  paint(frame) {
    this.canvasCtx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
  }
}
