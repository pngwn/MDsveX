# Component Documentation

Render interactive UI from markdown using custom components.

<AlertBox type="warning">

This API is _experimental_ and may change in future releases.

</AlertBox>

## Widget Gallery

Here's a counter starting at zero: <Widget count="0" /> and one at ten: <Widget count="10" />.

<section>

### Card Layout

Cards are the primary UI surface. They support **nesting** and _rich content_.

<div class="card">

#### Basic Card

A simple card with a title and body text. Cards can contain any markdown:

- Lists with _emphasis_
- Links to [documentation](https://example.com)
- Inline `code` samples

</div>

<div class="card highlighted">

#### Featured Card

This card has the `highlighted` class for visual emphasis.

> Cards can contain block quotes too. This is useful for testimonials or callouts.

```js
const card = document.querySelector('.card');
card.classList.toggle('highlighted');
```

</div>

</section>

## Form Components

<form action="/api/submit" method="POST">

<div class="field">

**Name**, <input type="text" placeholder="Enter name" />

</div>

<div class="field">

**Email**, <input type="email" placeholder="user@example.com" />

</div>

<div class="field">

**Role**, Choose a role for the new team member.

</div>

<button type="submit" disabled>Submit</button>

</form>

## Interactive Examples

<AlertBox type="info">

Each example below demonstrates a different component pattern.

</AlertBox>

### Counters

Inline counters: <Widget count="5" /> <Widget count="100" /> <Widget count="-3" />

### Nested Components

<div class="wrapper">

<AlertBox type="success">

Operation completed. Here is a widget inside an alert: <Widget count="42" />

</AlertBox>

<AlertBox type="error">

Something went wrong. **Error code**: `E_TIMEOUT`. Please retry.

</AlertBox>

</div>

## Mixed Content

This section mixes HTML elements with standard markdown features.

<aside>

### Sidebar Note

This aside contains a ~~deprecated~~ updated list:

1. First item with ^superscript^
2. Second with _emphasis_ and _strong_
3. Third with `inline code`

</aside>

The main content continues here with a [link](https://example.com 'Example Site') and an image reference.

![Architecture diagram](arch.png)

<details>

<summary>

**Click to expand**, _additional details_

</summary>

This is the expanded content with a code block:

```typescript
interface Component {
	name: string;
	render(): string;
}
```

And a table for good measure:

| Prop     | Type    | Default | Description           |
| :------- | :------ | :-----: | :-------------------- |
| count    | number  |    0    | Initial counter value |
| type     | string  |  info   | Alert variant         |
| disabled | boolean |  false  | Disable interaction   |

</details>

<!-- This is a hidden comment that should be preserved -->

<footer>

Built with _PFM_, Penguin-Flavoured Markdown. <br /> Version 1.0.0

</footer>
