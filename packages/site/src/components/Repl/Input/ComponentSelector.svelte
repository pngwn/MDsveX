<script>
  import { getContext } from "svelte";

  export let handle_select;
  export let funky;

  const { components, selected, request_focus, rebundle } = getContext("REPL");

  let editing = null;

  function selectComponent(component) {
    if ($selected !== component) {
      editing = null;
      handle_select(component);
    }
  }

  function editTab(component) {
    if ($selected === component) {
      editing = $selected;
    }
  }

  function closeEdit() {
    const match = /(.+)\.(svelte|svx|js)$/.exec($selected.name);
    $selected.name = match ? match[1] : $selected.name;
    if (isComponentNameUsed($selected)) {
      $selected.name = $selected.name + "_1";
    }
    if (match && match[2]) $selected.type = match[2];

    editing = null;

    // re-select, in case the type changed
    handle_select($selected);

    components = components; // TODO necessary?

    // focus the editor, but wait a beat (so key events aren't misdirected)
    setTimeout(request_focus);

    rebundle();
  }

  function remove(component) {
    let result = confirm(
      `Are you sure you want to delete ${component.name}.${component.type}?`
    );

    if (result) {
      const index = $components.indexOf(component);

      if (~index) {
        components.set(
          $components.slice(0, index).concat($components.slice(index + 1))
        );
      } else {
        console.error(`Could not find component! That's... odd`);
      }

      handle_select($components[index] || $components[$components.length - 1]);
    }
  }

  function selectInput(event) {
    setTimeout(() => {
      event.target.select();
    });
  }

  let uid = 1;

  function addNew() {
    const component = {
      name: uid++ ? `Component${uid}` : "Component1",
      type: "svelte",
      source: "",
    };

    editing = component;

    setTimeout(() => {
      // TODO we can do this without IDs
      document.getElementById(component.name).scrollIntoView(false);
    });

    components.update((components) => components.concat(component));
    handle_select(component);
  }

  function isComponentNameUsed(editing) {
    return $components.find(
      (component) => component !== editing && component.name === editing.name
    );
  }
</script>

<style>
  .component-selector {
    position: relative;
    overflow: hidden;
  }

  .file-tabs {
    border: none;
    margin: 0;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 10px 15px;
  }

  .file-tabs .button,
  .file-tabs button {
    position: relative;
    display: inline-block;
    font: 400 12px/1.5 var(--font);
    font-size: 1.5rem;
    border: none;
    padding: 12px 34px 8px 8px;
    margin: 0;
    border-radius: 0;
  }

  .file-tabs .button:first-child {
    padding-left: 12px;
  }

  .file-tabs .button.active {
    font-size: 1.6rem;
    font-weight: bold;
  }

  .editable,
  .uneditable,
  .input-sizer,
  input {
    display: inline-block;
    position: relative;
    line-height: 1;
  }

  .input-sizer {
    color: #ccc;
  }

  input {
    position: absolute;
    width: 100%;
    left: 8px;
    top: 12px;
    font: 400 12px/1.5 var(--font);
    border: none;
    color: var(--flash);
    outline: none;
    background-color: transparent;
  }

  .remove {
    position: absolute;
    display: none;
    right: 1px;
    top: 4px;
    width: 16px;
    text-align: right;
    padding: 12px 0 12px 5px;
    font-size: 8px;
    cursor: pointer;
  }

  .remove:hover {
    color: var(--flash);
  }

  .file-tabs .button.active .editable {
    cursor: text;
  }

  .file-tabs .button.active .remove {
    display: block;
  }

  .add-new {
    position: absolute;
    left: 0;
    top: 0;
    padding: 12px 10px 8px 0 !important;
    height: 40px;
    text-align: center;
  }

  .add-new:hover {
    color: var(--flash) !important;
  }

  svg {
    position: relative;
    overflow: hidden;
    vertical-align: middle;
    -o-object-fit: contain;
    object-fit: contain;
    -webkit-transform-origin: center center;
    transform-origin: center center;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
    transform: translate(-12px, 3px);
  }

  .file-tabs.funky {
    display: flex;
    justify-content: center;
    background: #fafafa;
  }

  .file-tabs .button.funky,
  .file-tabs .button.funky.active {
    border-left: 1px solid #ddd;
    border-bottom: none;
    background: transparent;
  }

  .button.funky:last-child {
    border-left: 1px solid #ddd;
    border-right: 1px solid #ddd;
  }
</style>

<div class="component-selector">
  {#if $components.length}
    <div class="file-tabs" on:dblclick={addNew} class:funky>
      {#each $components as component, index}
        <div
          id={component.name}
          class="button"
          role="button"
          class:active={component === $selected}
          class:funky
          on:click={() => selectComponent(component)}
          on:dblclick={(e) => e.stopPropagation()}>
          {#if component.name == 'App' && index === 0}
            <div class="uneditable">App.{component.type}</div>
          {:else if component === editing}
            <span class="input-sizer">
              {editing.name + (/\./.test(editing.name) ? '' : `.${editing.type}`)}
            </span>

            <!-- svelte-ignore a11y-autofocus -->
            <input
              autofocus
              spellcheck={false}
              bind:value={editing.name}
              on:focus={selectInput}
              on:blur={closeEdit}
              on:keydown={(e) => e.which === 13 && !isComponentNameUsed(editing) && e.target.blur()}
              class:duplicate={isComponentNameUsed(editing)} />
          {:else}
            <div
              class="editable"
              title="edit component name"
              on:click={() => editTab(component)}>
              {component.name}.{component.type}
            </div>

            {#if !funky}
              <span class="remove" on:click={() => remove(component)}>
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <line stroke="#999" x1="18" y1="6" x2="6" y2="18" />
                  <line stroke="#999" x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            {/if}
          {/if}
        </div>
      {/each}

      {#if !funky}
        <button class="add-new" on:click={addNew} title="add new component">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <line stroke="#999" x1="12" y1="5" x2="12" y2="19" />
            <line stroke="#999" x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>
