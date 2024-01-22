<script>
  import { onMount } from "svelte";
  import Input from "../components/Input.svelte";
  import Output from "../components/Output.svelte";

  const _input = [
    [
      { color: "green", text: "#", l: 0 },
      { color: "green", text: " mdsvex", l: 1 },
    ],
    [{ color: "grey", text: "svelte in markdown ", l: 0 }],
    [
      { color: "teal", text: "<", l: 0 },
      { color: "blue", text: "Penguin", l: 1 },
      { color: "teal", text: " />", l: 8 },
    ],
  ];

  const _heading = "mdsvex";
  const _paragraph = "svelte in markdown";
  const _penguin = false;

  let input = [];
  let heading = { value: "", l: 2 };
  let paragraph = { value: "", l: 0 };
  let penguin = false;
  let walk = false;

  const wait = (t) => new Promise((res) => setTimeout(res, t));

  onMount(async () => {
    await wait(1000);
    input = [...input, _input[0]];
    heading.value = _heading;
    await wait(1000);
    input = [...input, _input[1]];
    paragraph.value = _paragraph;
    await wait(2500);
    input = [...input, _input[2]];
    await wait(1100);
    penguin = true;
    await wait(100);
    input[2] = [
      input[2][0],
      input[2][1],
      { color: "yellow", text: " walk", l: 8 },
      { color: "red", text: "=", l: 13 },
      { color: "teal", text: "{", l: 14 },
      { color: "orange", text: "true", l: 20 },
      { color: "teal", text: "}", l: 15 },
      { color: "teal", text: " />", l: 8 },
    ];
    await wait(3000);
    walk = true;
  });
</script>

<svelte:head>
  <link
    rel="preload"
    as="font"
    crossorigin
    href="/fonts/roboto-thin-webfont.woff2" />
  <title>mdsvex - markdown in svelte!</title>

</svelte:head>

<main>
  <Output {heading} {paragraph} {penguin} {walk} />
  <Input {input} />
</main>
