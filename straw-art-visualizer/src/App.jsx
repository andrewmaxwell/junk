import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Download } from 'lucide-react';
import { generateLattice, calculateHeights, calculateCutList } from './utils';

// Constants
const FRAME_WIDTH = 1170; // 117cm in mm
const FRAME_HEIGHT = 150; // 15cm in mm
const STRAW_DIAMETER = 7; // mm
const UNCUT_LENGTH = 259; // mm

// 3D component for the straws
function StrawMesh({ data }) {
  const meshRef = useRef();
  
  // Create cylinder geometry (radiusTop, radiusBottom, height, radialSegments)
  // We orient it so it stands on the Z axis but Threejs cylinder is along Y. 
  // We'll rotate it in the instance matrix.
  const geometry = useMemo(() => {
    // Make cylinder hollow (openEnded = true)
    const geo = new THREE.CylinderGeometry(STRAW_DIAMETER / 2, STRAW_DIAMETER / 2, 1, 16, 1, true);
    geo.rotateX(Math.PI / 2); // Stand upright along Z
    // Move origin to the bottom so they all sit on the same plane
    geo.translate(0, 0, 0.5); 
    return geo;
  }, []);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#d97757', // Copper base color
      metalness: 0.8,
      roughness: 0.2,
      side: THREE.DoubleSide // Render inside of hollow straw
    });
  }, []);

  useEffect(() => {
    if (!meshRef.current || !data) return;
    
    const dummy = new THREE.Object3D();
    
    // We center the whole artwork at (0,0) for the camera
    const offsetX = -FRAME_WIDTH / 2;
    const offsetY = -FRAME_HEIGHT / 2;

    data.forEach((straw, i) => {
      dummy.position.set(straw.x + offsetX, straw.y + offsetY, 0);
      // Scale Z to match the calculated height
      dummy.scale.set(1, 1, straw.z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, data.length]} castShadow receiveShadow />
  );
}

function App() {
  const [params, setParams] = useState({
    frequency: 0.150,
    damping: 0.0085,
    centerAmp: 60,
    sideAmp: 36,
    complexity: 1.0,
    minHeight: 10,
    maxHeight: 50,
  });

  // Calculate lattice only once
  const lattice = useMemo(() => generateLattice(FRAME_WIDTH, FRAME_HEIGHT, STRAW_DIAMETER), []);
  
  // Recalculate heights when params change
  const straws = useMemo(() => {
    return calculateHeights(lattice, params);
  }, [lattice, params]);

  // Calculate statistics
  const stats = useMemo(() => calculateCutList(straws, UNCUT_LENGTH), [straws]);

  // Export 2D Map
  const handleExport = () => {
    const canvas = document.createElement('canvas');
    // Scale for high resolution (e.g. 5 pixels per mm)
    const scale = 5;
    canvas.width = FRAME_WIDTH * scale;
    canvas.height = FRAME_HEIGHT * scale;
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw straws
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    straws.forEach(straw => {
      const cx = straw.x * scale;
      const cy = (FRAME_HEIGHT - straw.y) * scale; // Invert Y for 2D canvas coords
      const r = (STRAW_DIAMETER / 2) * scale;
      
      // Draw circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw text
      ctx.fillStyle = '#000000';
      // Adjust font size based on scale to fit inside circle
      ctx.font = `${r * 0.8}px sans-serif`;
      ctx.fillText(straw.z.toString(), cx, cy);
    });
    
    // Trigger download
    const link = document.createElement('a');
    link.download = 'straw-artwork-map.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="app-container">
      {/* 3D Canvas */}
      <div className="canvas-container">
        <Canvas camera={{ position: [0, -400, 300], fov: 45, up: [0, 0, 1], far: 10000 }} shadows>
          <color attach="background" args={['#020617']} />
          
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[200, 200, 300]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize-width={2048} 
            shadow-mapSize-height={2048} 
          >
            <orthographicCamera attach="shadow-camera" args={[-800, 800, 800, -800, 0.1, 2000]} />
          </directionalLight>
          <pointLight position={[-200, -200, 100]} intensity={0.5} color="#d97757" />
          
          <Environment preset="city" />
          
          <StrawMesh data={straws} />
          
          {/* Base board */}
          <mesh position={[0, 0, -0.5]} receiveShadow>
            <boxGeometry args={[FRAME_WIDTH + 20, FRAME_HEIGHT + 20, 1]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          
          <ContactShadows position={[0, 0, -1]} opacity={0.4} scale={1500} blur={2} far={50} />
          <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2 + 0.1} 
            target={[0, 0, 25]} 
          />
        </Canvas>
      </div>

      {/* UI Panel */}
      <div className="ui-panel">
        <div className="panel-header">
          <h1>Straw Artwork</h1>
          <p>3D Visualization & Planning Tool</p>
        </div>

        <div className="panel-section">
          <h2>Wave Parameters</h2>
          
          <div className="control-group">
            <div className="control-header">
              <span>Wavelength (Frequency)</span>
              <span className="control-value">{params.frequency.toFixed(3)}</span>
            </div>
            <input 
              type="range" 
              min="0.005" max="0.5" step="0.001" 
              value={params.frequency}
              onChange={(e) => setParams({...params, frequency: parseFloat(e.target.value)})}
            />
          </div>
          
          <div className="control-group">
            <div className="control-header">
              <span>Damping (Decay)</span>
              <span className="control-value">{params.damping.toFixed(4)}</span>
            </div>
            <input 
              type="range" 
              min="0.001" max="0.05" step="0.0005" 
              value={params.damping}
              onChange={(e) => setParams({...params, damping: parseFloat(e.target.value)})}
            />
          </div>
          
          <div className="control-group">
            <div className="control-header">
              <span>Center Amplitude</span>
              <span className="control-value">{params.centerAmp}</span>
            </div>
            <input 
              type="range" 
              min="10" max="150" step="1" 
              value={params.centerAmp}
              onChange={(e) => setParams({...params, centerAmp: parseFloat(e.target.value)})}
            />
          </div>
          
          <div className="control-group">
            <div className="control-header">
              <span>Side Amplitude</span>
              <span className="control-value">{params.sideAmp}</span>
            </div>
            <input 
              type="range" 
              min="5" max="150" step="1" 
              value={params.sideAmp}
              onChange={(e) => setParams({...params, sideAmp: parseFloat(e.target.value)})}
            />
          </div>
          
          <div className="control-group">
            <div className="control-header">
              <span>Ripple Complexity</span>
              <span className="control-value">{params.complexity.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0" max="2" step="0.05" 
              value={params.complexity}
              onChange={(e) => setParams({...params, complexity: parseFloat(e.target.value)})}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <span>Min Height</span>
              <span className="control-value">{params.minHeight} mm</span>
            </div>
            <input 
              type="range" 
              min="5" max="50" step="1" 
              value={params.minHeight}
              onChange={(e) => setParams({...params, minHeight: parseInt(e.target.value)})}
            />
          </div>

          <div className="control-group">
            <div className="control-header">
              <span>Max Height</span>
              <span className="control-value">{params.maxHeight} mm</span>
            </div>
            <input 
              type="range" 
              min="20" max="150" step="1" 
              value={params.maxHeight}
              onChange={(e) => setParams({...params, maxHeight: parseInt(e.target.value)})}
            />
          </div>
        </div>

        <div className="panel-section">
          <h2>Statistics</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Total Cut Pieces</span>
              <span className="stat-value">{stats.totalStrawsNeeded.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Uncut Straws (259mm)</span>
              <span className="stat-value">{stats.uncutStrawsNeeded.toLocaleString()}</span>
            </div>
            <div className="stat-card full">
              <span className="stat-label">Material Waste</span>
              <span className="stat-value">{stats.wastePercentage}%</span>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <h2>Cut List</h2>
          <div className="cut-list-container">
            {stats.tally.map((item) => (
              <div key={item.length} className="cut-list-item">
                <span className="length-badge">{item.length} mm</span>
                <span className="count-badge">× {item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <button className="action-button" onClick={handleExport}>
            <Download size={18} />
            Export 2D Map (PNG)
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
