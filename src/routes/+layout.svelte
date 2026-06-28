<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	// Native cross-document-style View Transitions between routes (card → page morph).
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		// Respect reduced-motion: skip the morph, navigate instantly.
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

{@render children()}
