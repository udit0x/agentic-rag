# Design Guidelines: Local Multi-Agent RAG Orchestrator

## Design Approach: Reference-Based (Productivity Tools)

**Primary References**: ChatGPT, Linear, Notion
- ChatGPT: Clean chat interface patterns, message bubbles, input field design
- Linear: Typography hierarchy, crisp layouts, subtle interactions
- Notion: Two-pane layouts, context sidebars, settings organization

**Design Philosophy**: Utility-first with thoughtful detail. This is a professional productivity tool where clarity, scannability, and efficiency matter more than visual spectacle. Every design decision should reduce cognitive load and accelerate task completion.

---

## Typography

**Font Family**: 
- Primary: Inter or System UI stack for interface elements
- Monospace: JetBrains Mono or Fira Code for code blocks, citations, technical metadata

**Hierarchy**:
- Page Headers: text-2xl, font-semibold (Agent orchestration status, section titles)
- Message Sender: text-sm, font-medium (User/Assistant labels)
- Message Content: text-base, font-normal (Chat responses, document text)
- Citations: text-xs, font-medium (Source attribution, timestamps)
- Code Blocks: text-sm with monospace font
- Input Placeholder: text-sm, font-normal

**Line Height**: Use generous spacing - leading-relaxed (1.625) for message content to improve readability during scanning

---

## Layout System

**Spacing Scale**: Use Tailwind units of **2, 3, 4, 6, 8, 12** consistently
- Component padding: p-4 for cards, p-6 for panels
- Message spacing: space-y-4 between messages
- Section gaps: gap-6 for two-pane layout
- Input padding: p-3 for text areas

**Two-Pane Structure**:
- Main Chat Area: 60-65% width on desktop (min-w-0 to allow shrinking)
- Context Panel: 35-40% width, collapsible on mobile (hidden lg:block)
- Breakpoint: lg (1024px) - stack vertically below, side-by-side above

**Container Strategy**:
- Chat messages: max-w-3xl mx-auto for optimal reading (not full-width)
- Input field: Full width of chat container with max-w-4xl
- Context panel: Full height, fixed or sticky positioning

---

## Component Library

### Chat Interface

**Message Bubbles**:
- User messages: Align right, contained width (max-w-2xl), distinct styling
- Assistant messages: Align left, full container width for long responses
- Padding: px-4 py-3 for message content
- Border radius: rounded-2xl for modern, friendly feel
- Shadow: Subtle elevation (shadow-sm) for user messages

**Message Metadata**:
- Timestamp: Position top-right, text-xs
- Agent badge: Inline with assistant name (e.g., "Router Agent", "Reasoning Agent")
- Citation links: Superscript numbers [1] linking to sources

**Loading States**:
- Typing indicator: Three animated dots (scale animation)
- Skeleton: Pulse effect for message placeholders
- Progress bars: For document upload (linear, determinate)

### Document Upload

**Upload Zone**:
- Drag-and-drop area: Large target (min-h-48), dashed border
- Center-aligned icon (upload symbol) with supporting text
- File type indicators: "PDF, TXT supported" in muted text
- Active state: Border emphasis when dragging over

**File List**:
- Individual file cards: Horizontal layout with icon, name, size, remove button
- Upload progress: Linear progress bar beneath file name
- Status indicators: Checkmark (success), spinner (processing), X (error)

### Context Panel

**Panel Sections**:
- Header: "Context Sources" or "Agent Activity" with collapse icon
- Source cards: Compact cards (p-3) with document name, excerpt preview, timestamp
- Metadata display: Key-value pairs (text-xs) for chunk info
- Scrollable area: overflow-y-auto with max-h-screen

**Citation Preview**:
- Expandable accordion for each source
- Highlight matching text within excerpt
- External link icon for full document access

### Input Area

**Text Input**:
- Auto-resizing textarea (min-h-12, max-h-48)
- Clear affordance: Subtle border, focus ring emphasis
- Padding: p-4 for comfortable typing
- Corner elements: Character count (bottom-right), submit button (bottom-right)

**Action Buttons**:
- Primary submit: Icon button (send arrow), positioned absolute bottom-right of textarea
- Secondary actions: Attach document icon (left side)
- Disabled states: Reduced opacity when processing

### Settings Panel

**Organization**:
- Grouped sections: Model selection, temperature slider, advanced options
- Section headers: text-sm, font-semibold with mb-3
- Form controls: Consistent spacing (space-y-4)
- Toggles: Switch components for boolean settings

**Modal/Sidebar**:
- Slide-in from right (desktop) or bottom sheet (mobile)
- Backdrop: Semi-transparent overlay
- Width: max-w-md on desktop

---

## Navigation & Header

**Top Navigation**:
- Fixed header: sticky top-0 with backdrop blur
- Height: h-16 for comfortable touch targets
- Content: Logo/title (left), settings icon (right), upload button (center-right)
- Border: Subtle bottom border for section separation

**Empty States**:
- Center-aligned content when no messages
- Illustration or large icon (h-32 w-32)
- Heading: "Start a conversation" (text-xl, font-semibold)
- Sample prompts: 3-4 clickable prompt cards to inspire usage

---

## Specialized Components

**Agent Activity Trace** (Phase 2+):
- Timeline layout: Vertical connector lines between agent steps
- Step cards: Icon (agent type), label, timestamp, mini-preview
- Expandable: Click to see full reasoning

**Simulation Comparison** (Phase 3):
- Side-by-side layout: Current vs Simulated columns
- Numerical highlights: Large text (text-3xl) for key metrics
- Delta indicators: Arrows/percentages showing change
- Assumptions box: Outlined section listing input parameters

**Temporal Timeline** (Phase 4):
- Horizontal scrubber: Date markers, draggable handle
- Conflict badges: Warning icons on timeline where contradictions exist
- Version cards: Stack older/newer versions with transition arrows

---

## Interaction Patterns

**Animations**: Minimal, purposeful only
- Message appearance: Subtle fade-in (duration-200)
- Loading states: Smooth pulse, no aggressive flashing
- Panel transitions: Ease-in-out sliding (duration-300)
- Avoid: Excessive motion, distracting parallax

**Feedback**:
- Hover states: Subtle background shift on interactive elements
- Focus rings: Prominent outline for keyboard navigation
- Success toasts: Top-right corner, auto-dismiss after 3s
- Error messages: Inline beneath inputs, persistent until resolved

---

## Responsive Behavior

**Mobile (< 1024px)**:
- Single column: Chat takes full width
- Context panel: Accessible via bottom sheet or separate tab
- Upload: Full-width button triggering modal
- Input: Sticky to bottom with safe-area padding

**Desktop (≥ 1024px)**:
- Two-pane layout active
- Context panel: Always visible, resizable with drag handle
- Keyboard shortcuts: Display in settings (e.g., Cmd+K search)

---

## Images

**No Hero Images Required**: This is a utility application, not a marketing page. Focus on functional interface elements.

**Icon Usage**:
- Use Heroicons (via CDN) throughout - outline style for navigation, solid for filled states
- Agent type icons: Distinctive icons for Router, Retriever, Reasoning, Simulation, Temporal agents
- File type icons: Document preview in upload list
- Status indicators: Checkmark, spinner, warning triangle

---

## Accessibility

**Keyboard Navigation**:
- Tab order: Logical flow through chat history, input, controls
- Focus indicators: Prominent rings on all interactive elements
- Shortcuts: Cmd+K to focus search/input, Escape to close modals

**Screen Readers**:
- ARIA labels on icon buttons ("Send message", "Attach document")
- Role attributes: role="log" for message list, role="complementary" for context panel
- Live regions: Announce new messages, processing states

**Contrast & Readability**:
- Text meets WCAG AA standards (4.5:1 minimum)
- Interactive elements: Minimum 44x44px touch targets
- Error states: Not relying solely on visual indicators (include text)