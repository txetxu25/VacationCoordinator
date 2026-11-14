import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import { applyTheme } from './ui/theme';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <App />,
);
