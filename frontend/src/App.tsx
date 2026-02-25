import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GeneratorPage } from './pages/GeneratorPage';
import { AppRunPage } from './pages/AppRunPage';
import { SharePage } from './pages/SharePage';
import { GalleryPage } from './pages/GalleryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GeneratorPage />} />
        <Route path="/app/:id" element={<AppRunPage />} />
        <Route path="/share/:shortId" element={<SharePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
