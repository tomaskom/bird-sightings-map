import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import BirdMap from './components/BirdMap';

function App() {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', width: '100vw' }}>
      <h2 style={{ padding: 0, margin: 0, textAlign: 'center' }}>eBird Rare Bird Sightings</h2>
      <BirdMap />
    </div>
  )
}

export default App;
