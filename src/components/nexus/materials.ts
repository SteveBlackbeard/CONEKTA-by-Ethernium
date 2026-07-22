import { extend, ThreeElement } from '@react-three/fiber';
import { CoreShaderMaterial, BeamShaderMaterial } from '../shaders/CoreShader';

// Register materials for JSX use
extend({ CoreShaderMaterial, BeamShaderMaterial });

// Add types for JSX
declare module '@react-three/fiber' {
  interface ThreeElements {
    coreShaderMaterial: ThreeElement<typeof CoreShaderMaterial>;
    beamShaderMaterial: ThreeElement<typeof BeamShaderMaterial>;
  }
}

