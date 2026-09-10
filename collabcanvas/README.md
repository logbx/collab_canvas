# CollabCanvas

A real-time collaborative canvas application built with React, TypeScript, Konva.js, and Firebase. Create and edit shapes together with multiplayer cursors, presence awareness, and sub-100ms sync latency.

## 🚀 Status

**Active Development** - Core features complete, AI capabilities integrated.

## ✨ Features

### Core Collaboration
- **Real-time Sync**: Multiple users editing simultaneously (<100ms shape sync, <50ms cursor sync)
- **Multiplayer Cursors**: See collaborators' cursors with names and colors
- **Presence Awareness**: Real-time user status indicators
- **Object Locking**: Automatic locking prevents edit conflicts
- **Authentication**: Email/password and Google OAuth

### Canvas Tools
- **Multiple Shape Types**: Rectangles, circles, lines, and text boxes
- **Figma-Style Editing**: Direct manipulation with visual handles
- **Transform Controls**: Resize, rotate, reposition
- **Style Panel**: Colors, opacity, stroke, and fill controls
- **Layer Management**: Z-index ordering with bring-to-front/send-to-back
- **Alignment Tools**: Align and distribute selected shapes
- **Copy/Paste**: Full clipboard support
- **Undo/Redo**: Complete history with keyboard shortcuts
- **Export**: Download canvas as PNG, SVG, or JSON

### Advanced Features
- **AI Chat Integration**: Natural language commands to create and modify shapes
- **Bulk Shape Generation**: Create multiple shapes from patterns
- **Keyboard Shortcuts**: Comprehensive hotkey support (press `?` to view)
- **Context Menus**: Right-click for quick actions
- **Pan & Zoom**: Smooth canvas navigation

## 🛠 Tech Stack

- **Frontend**: React 19 + TypeScript 5.9 + Vite 7
- **Canvas**: Konva.js 10 + react-konva 19
- **Backend**: Firebase 12 (Auth, Firestore, Realtime Database)
- **AI**: LangChain + OpenAI (optional, for AI chat features)
- **Testing**: Vitest + React Testing Library

## 📋 Prerequisites

- Node.js 22+ (tested on 22.14)
- npm 10+
- Firebase account (for backend services)
- OpenAI API key (optional, only needed for AI chat features)

## 🚀 Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd collabcanvas
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Firebase credentials

# 3. Run development server
npm run dev
# Open http://localhost:5173

# 4. Run tests (optional)
npm test

# 5. Build for production
npm run build
```

## ⚙️ Configuration

### Required: Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password + Google provider
3. Create **Firestore Database** (start in test mode for development)
4. Create **Realtime Database** (start in test mode for development)
5. Get your config from Project Settings → General → Your apps

Edit `.env.local`:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
```

### Optional: AI Features

Add OpenAI API key to `.env.local` to enable AI chat:

```bash
VITE_OPENAI_API_KEY=sk-...
```

Without this key, the app works fully but AI chat will be disabled.

## 📜 Available Scripts

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
npm test         # Run tests
npm run lint     # Check code quality
```

## ✅ Continuous Integration

GitHub Actions CI runs automatically on push/PR to main branch:

- **Tests**: All 10 tests pass (mocked Firebase/OpenAI for CI)
- **Lint**: Code quality checks (warnings allowed)
- **Build**: Production build verification

Tests are designed to work without live Firebase or OpenAI API keys. The CI workflow uses mock credentials for verification.

## 🏗 Architecture

See [architecture.md](../architecture.md) for detailed system architecture, data models, and implementation patterns.

## 📊 Performance

### Measured Performance Metrics

- **Frame Rate**: 60 FPS sustained during all interactions (pan, zoom, drag, multi-user)
- **Shape Sync Latency**: <100ms (real-time updates via Firestore)
- **Cursor Sync Latency**: <50ms (ultra-low latency via Firebase Realtime Database)
- **Presence Updates**: 5-second throttled updates for activity tracking
- **Max Concurrent Users**: 5+ users tested simultaneously without degradation
- **Max Shapes Tested**: 100+ shapes with maintained 60 FPS

### Performance Optimizations

#### Rendering Optimizations
- **React.memo**: Applied to `Rectangle` and `Cursor` components to prevent unnecessary re-renders
- **Separate Konva Layers**: Cursors rendered on separate layer for independent updates
- **Custom Comparison**: Memoization with precise prop comparison for optimal performance
- **Listening Flags**: Non-interactive elements marked with `listening={false}`

#### Network Optimizations
- **Cursor Throttling**: Updates limited to 16ms (60 FPS) to reduce Firebase writes
- **Activity Throttling**: Presence activity updates throttled to 5 seconds
- **Batch Operations**: Stress test creates shapes in batches with delays to avoid rate limits

#### Data Synchronization
- **Firestore**: Used for persistent shape data (allows complex queries and transactions)
- **Realtime Database**: Used for ephemeral cursor/presence data (lower latency)
- **onDisconnect Handlers**: Automatic cleanup of stale cursor and presence data
- **Optimistic Updates**: Local state updates immediately, then sync to Firebase

### Development Tools

- **FPS Counter**: On-screen FPS display in development mode (bottom-left corner)
- **Stress Test**: Button to create 100 shapes for performance testing (dev mode only)
- **Error Boundary**: Graceful error handling with detailed error information in dev mode

### Performance Monitoring

To monitor performance in development:
1. Check the FPS counter in bottom-left corner (should stay at ~60 FPS)
2. Open Chrome DevTools → Performance tab
3. Use React DevTools Profiler to identify render bottlenecks
4. Monitor Network tab for Firebase request patterns

## 🔐 Security

**Note**: The current deployment uses Firebase test mode rules for rapid MVP development. 

**For production**, update Firestore and Realtime Database rules to:

```javascript
// Firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

// Realtime Database
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## ⚠️ Known Limitations

- MVP uses a single hardcoded canvas (`global-canvas-v1`)
- Only rectangle shapes supported
- Simple last-write-wins conflict resolution
- No undo/redo functionality
- No shape styling options

## 🚧 Future Enhancements (Phase 2)

- Multiple canvas support with routing
- Additional shape types (circles, text, lines, arrows)
- Shape styling (colors, borders, shadows)
- Resize and rotate functionality
- Multi-select with shift-click
- Undo/redo system
- AI agent integration
- Viewport culling for performance
- Canvas templates and export

## 📝 Development Guide

Follow the step-by-step implementation guide in [tasks.md](../tasks.md).

## 📄 License

MIT

## 🤝 Contributing

This is an MVP project. Contributions welcome after initial release.

---

**Built with ❤️ using React, TypeScript, Konva.js, and Firebase**
