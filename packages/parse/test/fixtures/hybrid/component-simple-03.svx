<Counter prop="prop"/>
<Counter prop=prop/>
<Counter prop="{prop}"/>
<Counter prop={prop}/>
<Counter prop="{[1, 2, 3, 4, 5, 6, 7]]}"/>
<Counter prop="{[{a: 1, b: { c: 2}}, {a: 1, b: { c: 2}}, {a: 1, b: { c: 2}}, {a: 1, b: { c: 2}}, {a: 1, b: { c: 2}}]}"/>
<Counter prop={() => val >= 27 ? runFunc() : runFunc2() } />
