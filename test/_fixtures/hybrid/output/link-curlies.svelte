<script>
  export let link = "some/link/to/page";
  export let title = "This is a title.";
</script>

<p>Hello I am text and this is a <a href="{link}">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}" title="This is a title">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}" title="{title}">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}{link}" title="{title}">link</a>.</p>
<p><img src="{link}" alt="some image">.</p>
<p><img src="{link}" alt="some image" title="Some title">.</p>
<p><img src="{link}" alt="some image" title="{title}">.</p>
