import { registerPlugin, Capacitor } from '@capacitor/core';

export const NativeAudio: any = registerPlugin('NativeAudio');
export const isNative = Capacitor.isNativePlatform();
