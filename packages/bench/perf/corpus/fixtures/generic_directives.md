:name[content]

:tag[]

:my-directive[text here]

:my_dir[stuff]

:h2o[water]

hello :name[content] world

:a[one] and :b[two]

hello: world

see :thing here

:123[nope]

::toc[Table of Contents]

::toc

::note[]

::name[content] extra stuff

hello

::note[content]

::my-component[Hello World]

> ::note[inside quote]

:notblock

hello
::note[interrupts paragraph]

:::warning[Caution]
Be careful here.
:::

:::note[]
Some text.
:::

:::section[]
# Heading

Paragraph text.
:::

:::note[]
Some text.

::::outer[]
:::inner[]
Content.
:::
::::

:::note[]
:::

:::note[]
Text.
:::::

::::note[]
Text.
:::
More text.
::::

:::example[]
```js
console.log("hi")
```
:::

:::section[]
Before.

---

After.
:::

> :::note[]
> Content.
> :::

:::section[]
::toc[]
:::

::note[with [brackets] inside]

::leaf-one[first]

::leaf-two[second]

::leaf[text](arg_one=val_one, arg_two=val_two)

::leaf[]()
