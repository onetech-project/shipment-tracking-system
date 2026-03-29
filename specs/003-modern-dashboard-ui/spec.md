# Feature Specification: Modern Responsive Dashboard UI Revamp

**Feature Branch**: `003-modern-dashboard-ui`  
**Created**: 2025-07-14  
**Status**: Draft  
**Input**: User description: "revamp UI to modern responsive design dashboard, leverage shadcn/ui and tailwindcss and add simple animation and shadow to improve UX on any user interaction, reuse as much as possible component, embrace mobile first design, ensure all functionality work after applying any changes, DO NOT MAKE ANY CHANGES TO THE BACKEND CODE, ONLY UPDATE THE UI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Responsive Navigation on Any Device (Priority: P1)

A user opens the application on a mobile phone. Instead of a fixed sidebar that overflows off-screen, a collapsible hamburger menu appears. On tablet and desktop the sidebar is visible by default. The user can tap the menu icon to reveal navigation links, tap a link to navigate, and the menu collapses automatically. On desktop, the sidebar remains always visible and the main content area resizes fluidly alongside it.

**Why this priority**: Navigation is the entry point to all features. If it is not usable on mobile, no other screen is accessible. This directly unblocks all mobile users and establishes the responsive layout foundation every other page builds upon.

**Independent Test**: Open the application on a 375px-wide viewport. Verify a hamburger icon is visible, tapping it reveals navigation links, tapping any link navigates to the correct page and closes the menu. On a 1280px viewport verify the sidebar is always visible and usable without a hamburger.

**Acceptance Scenarios**:

1. **Given** a user is on a mobile viewport (≤ 768px), **When** the page loads, **Then** the sidebar is hidden and a hamburger icon is visible in the top bar.
2. **Given** a user taps the hamburger icon on mobile, **When** the menu opens, **Then** all navigation links are visible with a smooth slide-in animation.
3. **Given** the mobile menu is open, **When** the user taps any navigation link, **Then** the menu closes and the correct page is displayed.
4. **Given** a user is on a desktop viewport (≥ 1024px), **When** the page loads, **Then** the sidebar is permanently visible without any toggle control.
5. **Given** the user resizes the browser from desktop to mobile width, **When** the viewport crosses the breakpoint, **Then** the layout adapts seamlessly without a page reload.

---

### User Story 2 - Modern Visual Design with Consistent Components (Priority: P2)

A user visiting any screen of the application — login, dashboard, shipment upload, history, settings — experiences a consistent, polished visual style. Buttons, inputs, tables, modals, badges, and cards all share the same look and feel. Interactive elements (buttons, links, table rows, form fields) respond to hover and focus with subtle shadow or highlight transitions, making the interface feel alive and responsive to user actions.

**Why this priority**: Visual consistency and interactive feedback are core to the revamp's value. Once the design system (shared components) is in place, all other screens inherit the improvement without additional effort.

**Independent Test**: Navigate through login, the dashboard home, shipment upload, and the users settings page. Confirm that all buttons share the same style, all form fields have consistent borders and focus rings, all modals have a frosted backdrop, and hovering or clicking any interactive element produces a visible visual response.

**Acceptance Scenarios**:

1. **Given** a user hovers over any button, **When** the pointer enters the button, **Then** the button displays a subtle shadow and color shift within 150ms.
2. **Given** a user focuses a form input with the keyboard, **When** the input receives focus, **Then** a clearly visible focus ring appears around the field.
3. **Given** a user opens any modal dialog, **When** the modal appears, **Then** it animates in (fade + scale) and the background is visually dimmed.
4. **Given** a user is on any page, **When** they view the page, **Then** all primary action buttons share a consistent style (color, size, border-radius).
5. **Given** a user views a data table, **When** they hover over a row, **Then** the row highlights to indicate interactivity.

---

### User Story 3 - Dashboard Home Page with Summary Cards (Priority: P3)

A logged-in user lands on the dashboard home page. Instead of plain text showing the username and organization ID, they see a welcoming header with their name and role, plus summary cards that surface key information at a glance (e.g., quick links to Upload, History, and QR Scan). The layout is a responsive card grid that collapses to a single column on mobile.

**Why this priority**: The dashboard home is the first thing every user sees after login. Upgrading it from plain text to a card-based summary immediately communicates the quality of the revamp, even though it does not introduce new data.

**Independent Test**: Log in and verify the dashboard home shows a welcome message with the username, role badge, and at least three action cards with icons. Resize to mobile and confirm the cards stack vertically.

**Acceptance Scenarios**:

1. **Given** a logged-in user is on the dashboard home, **When** the page renders, **Then** a welcome message displays the user's name and a role indicator.
2. **Given** the dashboard home is displayed, **When** the user views it, **Then** quick-access cards are shown for key sections (Upload Shipments, Upload History, QR Scan).
3. **Given** the user is on a mobile viewport, **When** viewing the dashboard home, **Then** the cards stack in a single column without horizontal scrolling.
4. **Given** the user is on a desktop viewport, **When** viewing the dashboard home, **Then** the cards display in a multi-column grid layout.
5. **Given** a user clicks a dashboard card, **When** they click, **Then** the card animates (slight scale/shadow) and navigates to the correct section.

---

### User Story 4 - Mobile-Friendly PDF Upload and Drag-and-Drop Zone (Priority: P4)

A user on a mobile phone needs to upload a shipment PDF. The upload drop zone is large enough to tap comfortably and displays clear instructions. The "Upload Shipments" button is prominently styled. Status messages and conflict review panels are readable and scrollable on narrow screens without horizontal overflow.

**Why this priority**: PDF upload is the primary shipment workflow. If it is unusable on mobile, field staff who rely on phones cannot perform their core task.

**Independent Test**: On a 375px viewport, navigate to Shipments > Import PDF. Confirm the drop zone is tappable, the file picker opens correctly, uploading a PDF shows a progress/status indicator, and any conflict review rows are scrollable without horizontal overflow.

**Acceptance Scenarios**:

1. **Given** a user is on mobile and taps the upload drop zone, **When** the tap event fires, **Then** the native file picker opens allowing PDF selection.
2. **Given** a PDF is selected, **When** the user taps "Upload Shipments", **Then** an animated loading indicator replaces the button label for the duration of the upload.
3. **Given** the upload completes with conflicts, **When** the conflict review panel appears, **Then** all conflict rows are visible and scrollable on a 375px-wide screen.
4. **Given** a non-PDF file is selected, **When** the user attempts to submit, **Then** a clearly styled error message appears in the same consistent error style used across the application.

---

### User Story 5 - Settings and Admin Pages on Small Screens (Priority: P5)

An admin user accesses Settings > Users on a tablet or phone. The users table is horizontally scrollable or transforms into a card list on small screens, preventing the table from overflowing the viewport. Action buttons (Edit, Inactivate, Unlock) remain tappable at a comfortable size. Modals used for editing or confirming actions fit within the screen and are scrollable if content is tall.

**Why this priority**: Admin workflows happen in the field as well as on desktop. Without mobile-friendly tables and modals, administrators cannot manage users on their phones.

**Independent Test**: On a 768px viewport, navigate to Settings > Users. Confirm the table is scrollable or reformatted so no content is clipped. Open the Edit modal and confirm it fits within the viewport, with inputs fully accessible.

**Acceptance Scenarios**:

1. **Given** an admin is on a tablet viewport and views the Users table, **When** the page renders, **Then** all table columns are accessible via horizontal scroll or the table reformats as a card list.
2. **Given** an admin taps the "Edit" button for a user, **When** the modal opens, **Then** the modal is fully visible within the viewport with no content hidden outside the screen bounds.
3. **Given** a modal is open on mobile, **When** the user taps outside the modal or presses the close button, **Then** the modal closes with the same fade-out animation used on open.

---

### Edge Cases

- What happens when a user with very long username or organization name views the dashboard — does the header/sidebar handle text overflow gracefully without breaking the layout?
- How does the mobile hamburger menu behave if a user rotates their device mid-session — does it reset to the appropriate state for the new viewport orientation?
- What happens when the shipment upload returns an error — is the error message styled consistently and visible without scrolling past the fold on a small screen?
- What happens when a data table has zero rows — does the empty state message display in a styled, friendly format rather than a blank page?
- How does the sidebar navigation render when the user has both Super Admin and Admin roles showing all menu sections — does the sidebar overflow on very short screens?
- What happens if an animation or transition is disabled by the user's "reduce motion" accessibility preference — are animations suppressed gracefully?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All existing application features (login, shipment upload, upload history, QR scan, user management, roles, organizations, invitations, permissions, audit log) MUST remain fully functional after the UI revamp.
- **FR-002**: The UI MUST be built using Tailwind CSS utility classes for all layout and styling; no inline `style` props or external CSS stylesheets (beyond Tailwind's base styles and global CSS variables) shall remain in the revamped components.
- **FR-003**: The UI MUST use shadcn/ui components as the primary component library, covering at minimum: Button, Input, Label, Card, Badge, Table, Dialog/Modal, Sheet (mobile drawer), Dropdown Menu, Form, Separator, and Avatar/Avatar Fallback.
- **FR-004**: The dashboard layout MUST be responsive and mobile-first, with the sidebar navigation collapsing to a slide-in drawer (Sheet) on viewports narrower than 1024px, and displaying permanently on viewports 1024px and wider.
- **FR-005**: Every interactive element (buttons, links, table rows, form inputs, cards, modals) MUST display a visible transition or animation on hover, focus, or activation — implemented using Tailwind transition utilities and CSS animations.
- **FR-006**: All modal/dialog components MUST use a consistent frosted or dimmed overlay backdrop and animate in (fade + scale) and out when opened and closed.
- **FR-007**: The application MUST respect the user's operating-system-level "prefer reduced motion" setting by suppressing non-essential animations when the preference is active.
- **FR-008**: Shared UI primitives (Button, Card, Badge, Modal/Dialog, Input, Label, FormField) MUST be extracted into reusable components consumed across all pages and features, eliminating duplicated UI logic.
- **FR-009**: The dashboard home page MUST display a welcome card with the logged-in user's name and role indicator, plus quick-access action cards for the primary workflows (Upload Shipments, Upload History, QR Scan).
- **FR-010**: All data tables (Users, Roles, Organizations, Invitations, Permissions, Audit Log, Upload History) MUST be horizontally scrollable on narrow viewports to prevent content overflow, and MUST display a styled empty-state message when no rows exist.
- **FR-011**: All form validation error messages MUST use a consistent visual style (icon + red text, same typography and spacing) derived from shared form field components.
- **FR-012**: The backend API client and all API call logic MUST remain unchanged; only the rendering layer (components, pages, layouts) is modified.
- **FR-013**: The login page MUST be redesigned with a centered card layout using shadcn/ui Form, Input, Label, and Button components, with appropriate loading and error states.
- **FR-014**: The sidebar MUST display the application brand name/logo area, navigation sections with labelled groups, and a "Sign out" action at the bottom — all styled consistently with the new design system.
- **FR-015**: Color scheme MUST use a coherent palette defined through Tailwind CSS configuration and/or CSS custom properties (CSS variables), making it easy to update the theme from a single location.

### Key Entities

- **Design System**: The set of shared shadcn/ui-based components and Tailwind configuration that define colors, spacing, typography, border radii, and animation durations used consistently across the entire frontend.
- **Sidebar / Navigation Drawer**: The primary navigation component that renders as a persistent sidebar on desktop and a slide-in Sheet on mobile, containing all navigation links and sign-out action.
- **Page Layout**: The outer shell (dashboard layout) that composes the Sidebar, a top bar (mobile only), and the main content area with consistent padding.
- **Data Table**: A reusable table component with consistent header styling, row hover states, horizontal scroll container, and empty-state slot.
- **Dialog/Modal**: A reusable modal wrapper built on shadcn/ui Dialog that applies consistent overlay, animation, and sizing across all confirmation and edit dialogs in the application.
- **Action Card**: A navigable card component used on the dashboard home to surface quick-access links to primary workflows, with icon, title, description, and hover animation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All five primary user journeys (login → dashboard, dashboard → upload PDF, dashboard → upload history, dashboard → QR scan, admin → settings/users) can be completed without horizontal scrolling on a 375px-wide mobile viewport.
- **SC-002**: Every interactive element (buttons, nav links, table rows, cards, form fields) visibly responds to hover or focus within 200ms on standard hardware, confirming that transition animations are working.
- **SC-003**: Zero regressions in existing end-to-end test coverage — all existing Playwright tests pass after the UI revamp without modification to any test file.
- **SC-004**: Any new shared component (Button, Card, Dialog, etc.) is used in at least two distinct pages or features, confirming successful component reuse rather than duplication.
- **SC-005**: The login page, dashboard home, and at least one settings page each build and render without TypeScript type errors or console errors.
- **SC-006**: The sidebar navigation is fully keyboard-navigable (Tab to focus links, Enter to activate) on both desktop and mobile drawer views.
- **SC-007**: On a device or browser session with "prefer reduced motion" enabled, no CSS transition or keyframe animation runs for non-essential UI changes (hover effects, modal entrance, menu slide-in).
- **SC-008**: The application visual style (colors, spacing, font sizes, border radii) can be updated by changing a single Tailwind configuration or CSS variable file without touching individual component files.

## Assumptions

- The application currently uses Next.js 14 (App Router) with React 18 and TypeScript; the revamp is scoped entirely to the `apps/frontend` directory.
- shadcn/ui will be initialized in the frontend project and Tailwind CSS will be installed and configured; these are the only new frontend dependencies being added.
- The existing backend API endpoints, request/response shapes, and authentication logic are not changed; only how the frontend renders data and collects user input changes.
- No new data or API endpoints are needed; the dashboard home action cards link to existing routes using existing data from the auth context.
- The existing Playwright end-to-end tests use `data-testid` attributes for element targeting; these attributes MUST be preserved on all revamped components to maintain test compatibility.
- Tailwind CSS and shadcn/ui are compatible with Next.js 14 App Router; this is a well-established pattern and requires no architectural changes.
- The "prefer reduced motion" behavior will be handled using Tailwind's `motion-safe` and `motion-reduce` variant utilities, requiring no custom JavaScript.
- Component icons will use a lightweight icon library compatible with shadcn/ui conventions (e.g., Lucide React, which is already bundled with shadcn/ui).
