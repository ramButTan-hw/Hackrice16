class HelpAudio extends AudioWorkletProcessor {
  constructor(){super();this.samples=new Float32Array(512);this.offset=0;}
  process(inputs){const channel=inputs[0]?.[0];if(channel)for(const value of channel){this.samples[this.offset++]=value;if(this.offset===512){this.port.postMessage(this.samples);this.offset=0;}}return true;}
}
registerProcessor('help-audio',HelpAudio);
