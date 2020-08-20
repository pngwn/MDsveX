<script>
  export let link = "some/link/to/page";
  export let title = "This is a title.";
</script>

<p>Hello I am text and this is a <a href="{link}">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}" title="This is a title">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}" title="{title}">link</a>.</p>
<p>Hello I am text and this is a <a href="{link}{link}" title="{title}">link</a>.</p>
<p><a href="/base/{variable}">Compound link</a></p>
<p><img src="{link}" alt="some image1"></p>
<p><img src="{assets}/file.jpg" alt="some image2" title="Some title text"></p>
<p><img src="{link}" alt="some image3" title="Some title"></p>
<p><img src="{link}" alt="some image4" title="{title}"></p>
