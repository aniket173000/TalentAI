import './index.css'
import { ViteReactSSG } from 'vite-react-ssg'
import { routes } from './App'

// vite-react-ssg owns the router: it renders the static marketing pages in Node
// at build time and hydrates the same tree (into #root) in the browser.
export const createRoot = ViteReactSSG({ routes })
