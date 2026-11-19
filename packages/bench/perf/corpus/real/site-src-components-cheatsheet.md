<style>
  :global(body) {
    background: #f8f8f8;

    /* height: 100vh; */
    box-sizing: border-box;
  }

  .cheatsheet :global(dl) {
    list-style: none;
    padding: 0;
    flex-direction: column;
    justify-content: space-between;
    height: 90%;
    margin: 0;
    font-size: 1.9rem;

  }

  .cheatsheet :global(dd) {
    margin: 5px 0 15px 0;
    font-style: italic;
  }

  .cheatsheet :global(dt span) {
    font-family: monospace;
    font-size: 16px;
    padding: 3px 6px;
    background: #eee;
    display: inline-block;
    margin: 10px 0 0 0;
    border-radius: 3px;
  }

  .cheatsheet :global(li:first-child > span) {
    margin-top: 14px;
  }

  .cheatsheet :global(li:last-child > span) {
    margin-bottom: 20px;
  }
  .cheatsheet :global(h2) {
    color: #555;
  }

  .cheatsheet :global(.container) {
    height: 850px;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(12, 1fr);
    grid-gap: 30px;
    min-height: 850px;
    max-height: 850px;
    margin: 65px;
  }

  .cheatsheet :global(.box) {
    background: #fff;
    padding: 0 20px;
    min-width: 0;
    min-height: 0;
    box-shadow:  0 1px 5px rgba(0, 0, 0, 0.15);
  }

  .cheatsheet :global(.install) {
    grid-column: 1 / span 4;
    grid-row: 1 / span 4;
  }

  .cheatsheet :global(.use) {
    grid-column: 5 / span 4;
    grid-row: 1 / span 5;
  }

  .cheatsheet :global(.config) {
    grid-column: 9 / span 4;
    grid-row: 1 / span 12;
    display: grid;
    grid-template-rows: repeat(12, 1fr);
  }

  .cheatsheet :global(.config > div) {
    grid-row: 1 / span 1;
  }

  .cheatsheet :global(.config > dl) {
    grid-row: 2 / span 11;
    height: 77vh;
  }

  .cheatsheet :global(.layouts) {
    grid-column: 1 / span 4;
    grid-row: 5 / span 8;
  }

  .cheatsheet :global(.frontmatter) {
    grid-column: 5 / span 4;
    grid-row: 6 / span 4;
  }

  .cheatsheet :global(.integrations) {
    grid-column: 5 / span 4;
    grid-row: 10 / span 3;
  }

  .cheatsheet :global(pre),
  .cheatsheet :global(h2) {
    margin-top: 2rem;
  }

  .cheatsheet :global(pre) {
    border-radius: 3px;
    padding: 1rem 1rem 1.4rem 2rem;
    line-height: 1.3;
  }

  .cheatsheet :global(code) {
    border-radius: 3px;
    font-size: 14px;
    overflow: scroll;
  }

  .cheatsheet :global(.box) {
    position: relative;
    display: inline-block;
  }


  .cheatsheet :global(h2) {
    font-weight: normal;
    text-transform: lowercase;
    font-family: "fira-full";
    font-size: 2rem;
    margin-bottom: 2rem;
  }

  .cheatsheet :global(h2 a), .cheatsheet :global(h3 a) {
    border: none;
  }

  .cheatsheet :global(h2 a::before), .cheatsheet :global(h3 a::before) {
    content: '#';
    color: #bbb;
    font-size: 2rem;
  }

   .cheatsheet :global(h3 a::before) {
    font-size: 1.7rem;
  }

  .cheatsheet :global(h3) {
    font-size: 1.7rem;
    margin-bottom: 0;
    margin-top: 2rem;
    font-family: 'fira-full';
  }

  .cheatsheet :global(h3 + pre) {
    margin-top: 0.5rem;
  }

  .cheatsheet :global(.box > p) {
    display: none;
    margin-top: 10px;
  }

  .cheatsheet :global(.box > .keep) {
    display: block;
  }

  @media (max-width: 1100px) {
    .cheatsheet :global(.container) {
      display: grid;
      flex-wrap: wrap;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(26, 1fr);
      grid-gap: 30px;
      max-height: 1450px;
      height: 1450px;
    }

    .cheatsheet :global(.install) {
      grid-column: 1 / span 1;
      grid-row: 1 / span 5;
    }

    .cheatsheet :global(.use) {
      grid-column: 2 / span 1;
      grid-row: 1 / span 6;
    }

    .cheatsheet :global(.config) {
      grid-column: 1 / span 1;
      grid-row: 6 / span 14;
    }

    .cheatsheet :global(.config > dl) {
      font-size: 1.8rem;
    }

    .cheatsheet :global(.layouts) {
      grid-column: 2 / span 1;
      grid-row: 7 / span 10;
    }

    .cheatsheet :global(.frontmatter) {
      grid-column: 1 / span 1;
      grid-row: 20 / span 5;
    }

    .cheatsheet :global(.integrations) {
      grid-column: 2 / span 1;
      grid-row: 17 / span 3;
    }
  }

  @media (max-width: 750px) {
    .cheatsheet :global(.container) {
      display: block;
      height: auto;
      max-height: inherit;
      margin: 65px 60px;
    }

    .cheatsheet :global(.box){
      display: block;
      padding: 2rem;
      margin: 3rem 0;
      border-radius: 0;
    }
  }

  @media (max-width: 550px) {
    .cheatsheet :global(.container) {
      margin: 65px 0 0 0;
    }
  }

  .cheatsheet :global(.config > dl) {
    height: fit-content;
  }


</style>

<script>
  import cheatsheet from './_cheatsheet.svtext';
</script>

<div class="cheatsheet">
  {@html cheatsheet}
</div>
