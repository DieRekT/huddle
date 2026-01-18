
# Design Tokens — Celtics-inspired, Accessibility-first



## Principles

- Neutrals carry structure; green is an accent.

- Do not rely on color alone to communicate state.

- Contrast must hold in bright daylight and low light.



## Token list (CSS variables)

Use these names exactly.



:root {

  /* Neutrals */

  --bg: #0B0F14;              /* deep near-black */

  --surface: #111827;         /* slate surface */

  --surface-2: #0F172A;       /* deeper surface */

  --text: #F9FAFB;            /* near-white */

  --text-muted: #CBD5E1;      /* muted slate */

  --border: rgba(148,163,184,0.22);



  /* Celtics accents */

  --accent: #007A33;          /* Celtics green */

  --accent-2: #00A651;        /* brighter green for highlights */

  --accent-soft: rgba(0,122,51,0.18);



  /* Status (do not overuse) */

  --good: #22C55E;

  --warn: #F59E0B;

  --bad: #EF4444;



  /* Typography */

  --font-sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, "Apple Color Emoji", "Segoe UI Emoji";

  --radius: 18px;

  --shadow: 0 12px 30px rgba(0,0,0,0.35);



  /* Spacing */

  --pad: 16px;

  --pad-lg: 22px;



  /* Motion */

  --anim-fast: 140ms;

  --anim: 220ms;

  --anim-slow: 420ms;

}



## Component styling rules

- Primary status line: 44–64px depending on viewport, weight 700

- Secondary line: 18–22px, weight 500, muted

- Coverage chip: pill with border + subtle accent tint

- Top bar: fixed height, minimal buttons, no clutter

- Cards: only when needed; avoid multi-card dashboards



## State color usage

- RoomState should NOT be a red/green traffic light.

- Use a subtle left accent bar or small dot indicator, not a full background fill.

- Coverage uses neutral chip + small dot, with text always present.



## Design token checklist (implementation gate)

- [ ] All colors referenced via CSS variables only

- [ ] Contrast mode increases text and border weights

- [ ] Reduce motion disables pulse animation and uses fades only

- [ ] No element uses color as the sole indicator

- [ ] Status text never overlaps or clips at max text size

