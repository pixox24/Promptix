# Sticky Sidebar Search Design

## Goal

Keep the desktop filter sidebar's search control visible while users scroll through long filter groups. Preserve the existing mobile filter drawer behavior.

## Chosen Approach

Move the desktop search control out of the sidebar's scrollable body and into the fixed header region. The fixed region contains the existing title, helper copy, and search input. The existing `sidebar-scroll` element continues to own vertical scrolling for sort and tag controls only.

This is preferred over making the whole sidebar non-scrollable (which would hide lower filters) and over duplicating search in the page header (which adds a second, competing search entry point).

## Scope

- Change `FilterSidebar` markup and spacing only.
- Keep the query state, URL synchronization, filtering behavior, input styles, and keyboard behavior unchanged.
- Do not change the mobile `MobileFilterBar`.

## Acceptance Criteria

1. On `md` and larger screens, the search input remains visible when the sidebar filter area is scrolled.
2. Sort and tag filters remain reachable via the sidebar's independent scroll area.
3. Entering a query still updates the existing query state and filters the template grid.
4. Mobile filtering continues to render its search input inside the expanded mobile panel.

## Verification

- Run the web build and lint checks.
- Manually inspect the desktop sidebar at a viewport where the filter content overflows, then confirm the search remains visible while filters scroll.
- Run the existing repository test suite; record unrelated baseline failures if they persist.
