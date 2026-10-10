import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The loader for the component models in public/models/parts. They are meshopt-compressed (EXT_meshopt_compression);
 * the decoder ships with three, so nothing is fetched from elsewhere. Draco is deliberately not set up: its default
 * decoder would come from a CDN, and a Draco model simply fails to load (the sheet then keeps the art it had).
 */
export const createPartLoader = (): GLTFLoader => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
