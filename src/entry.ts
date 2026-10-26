// Route: v2 by default; ?v1 keeps the old game reachable while v2 matures.
if (new URLSearchParams(location.search).has('v1')) import('./main'); else import('./main2');
