export const table_without_positions = {
	type: 'root',
	children: [
		{
			type: 'svelteMeta',
			tagName: 'script',
			properties: [],
			selfClosing: false,
			children: [
				{
					type: 'text',
					value:
						"\n  import { beforeUpdate, createEventDispatcher, onMount } from 'svelte';\n  import { classnames } from '../../helpers/classnames';\n  import orderBy from 'lodash/orderBy';\n  import Pagination from '../Pagination/Pagination.svelte';\n  import Spinner from '../Spinner/Spinner.svelte';\n\n  const dispatch = createEventDispatcher();\n\n  let tableData = undefined;\n\n  export let isLoading = false;\n  export let hasBorder = false;\n  export let isRowClickable = false;\n  export let activeSort = undefined;\n  export let activeSortDirection = undefined;\n  export let currentPage = 1;\n  export let pageSize = 10;\n  export let isDynamic = false;\n  export let columns = [];\n  export let showHeader = true;\n  export let noResultsMessage = 'No results available';\n  export let hasPagination = false;\n  export let itemTotal = 0;\n  export let data = [];\n  export let rowCssClass = () => {};\n\n  let ClassNames;\n\n  $: {\n    ClassNames = classnames({\n      hasBorder,\n      isLoading,\n      isRowClickable,\n      noHeader: !showHeader\n    });\n  }\n\n  $: {\n    if(data) {\n      tableData = data;\n    }\n  }\n\n  $: {\n    itemTotal = isDynamic ? itemTotal : data.length;\n  }\n\n  let Data;\n\n  $: {\n    if (!tableData) {\n      Data = [];\n    } else if (isDynamic) {\n      Data = tableData;\n    } else {\n      let processedData = tableData;\n\n      if (activeSort) {\n        processedData = orderBy(tableData, activeSort, activeSortDirection);\n      }\n\n      const currentPageSize = pageSize || processedData.length;\n\n      Data = processedData.slice((currentPage * currentPageSize) - currentPageSize, currentPage * currentPageSize);\n    }\n  }\n\n  export function sort(selectedHeaderItem) {\n    const currentActiveSort = activeSort;\n    const currentDirection = activeSortDirection;\n    const dataLookup = typeof selectedHeaderItem.cell === 'string' ? selectedHeaderItem.cell : '';\n    const selectedSort = typeof selectedHeaderItem.sort === 'boolean' ? dataLookup : selectedHeaderItem.sort;\n\n    let newActiveSort = null;\n    let newSortDirection = null;\n\n    if (currentActiveSort !== selectedSort) {\n      newActiveSort = selectedSort;\n      newSortDirection = 'asc';\n    } else {\n\n      if (!currentDirection) {\n        newSortDirection = 'asc';\n      } else if (currentDirection === 'asc') {\n        newSortDirection = 'desc';\n      } else {\n        newSortDirection = null;\n      }\n\n      newActiveSort = newSortDirection ? currentActiveSort : null;\n    }\n\n    activeSort = newActiveSort, activeSortDirection = newSortDirection;\n\n    onChange();\n  }\n\n  function onChange() {\n    dispatch('change', {\n      currentPage,\n      pageSize,\n      activeSort,\n      activeSortDirection\n    });\n  }\n\n  function onRowClick(rowItem) {\n    dispatch('rowClick', rowItem);\n  }\n\n  function colWidth(col) {\n    return col.width ? `width:${col.width};min-width:${col.width};` : '';\n  }\n\n  function cellAlign(cell) {\n    return cell.align ? `text-align:${cell.align};` : '';\n  }\n\n  function sortClassNames(sort, lookup, activeSort, activeSortDirection) {\n    const dataLookup = typeof lookup === 'string' ? lookup : '';\n    const actualSort = typeof sort === 'boolean' ? dataLookup : sort;\n\n    return classnames({\n      'sort-asc': actualSort === activeSort && activeSortDirection === 'asc',\n      'sort-desc': actualSort === activeSort && activeSortDirection === 'desc'\n    });\n  }\n\n\n  let previous = false;\n  let data_prev = undefined;\n\n  onMount(() => {\n    isRowClickable = !!arguments[0].$$.callbacks.rowClick;\n  });\n",
				},
			],
		},
		{
			type: 'text',
			value: '\n\n',
		},
		{
			type: 'svelteMeta',
			tagName: 'style',
			properties: [],
			selfClosing: false,
			children: [
				{
					type: 'text',
					value:
						'\n  .wrapper {\n    position: relative;\n  }\n\n  .table.hasBorder {\n    border: 1px solid #EBEDEF;\n    border-radius: 4px;\n  }\n\n  .isLoading {\n    min-height: 150px;\n    opacity: 0.6;\n  }\n\n  .loader {\n    cursor: wait;\n    position: absolute;\n    top: 0;\n    left: 0;\n    right: 0;\n    bottom: 0;\n  }\n\n  .loader_spinner {\n    color: var(--green_4, #51ce6c);\n    width: 25px;\n    height: 25px;\n    position: absolute;\n    top: 50%;\n    left: 50%;\n    margin: -25px 0 0 -25px;\n  }\n\n  .pagination {\n    padding: 20px 0;\n  }\n\n  table {\n    border: none;\n    border-collapse: collapse;\n    table-layout: fixed;\n    width: 100%;\n  }\n\n  table thead th {\n    border-bottom: 1px solid var(--neutral_0);\n    box-sizing: border-box;\n    color: var(--neutral_6);\n    font-size: 12px;\n    font-weight: 600;\n    padding: 15px 28px;\n    text-align: left;\n    white-space: nowrap;\n  }\n\n  .sort {\n    display: inline-block;\n    cursor: pointer;\n    -webkit-touch-callout: none;\n    user-select: none;\n    position: relative;\n  }\n\n  .sort::after,\n  .sort::before {\n    border-width: 3px;\n    border-style: solid;\n    display: block;\n    height: 0;\n    position: absolute;\n    right: -11px;\n    width: 0;\n    content: " ";\n  }\n\n  .sort::before {\n    border-color: transparent transparent rgba(0, 0, 0, 0.2);\n    bottom: 8px;\n  }\n\n  .sort:hover::before {\n    border-color: transparent transparent rgba(0, 0, 0, 0.3);\n  }\n\n  .sort.sort-asc::before {\n    border-color: transparent transparent rgba(0, 0, 0, 0.6);\n  }\n\n  .sort::after {\n    border-color: rgba(0, 0, 0, 0.2) transparent transparent;\n    bottom: 0;\n  }\n\n  .sort:hover::after {\n    border-color: rgba(0, 0, 0, 0.3) transparent transparent;\n  }\n\n  .sort.sort-desc::after {\n    border-color: rgba(0, 0, 0, 0.6) transparent transparent;\n  }\n\n  .isRowClickable tbody tr:not(.noResultsMessage) {\n    cursor: pointer;\n    transition: all 0.15s;\n  }\n\n  .isRowClickable tbody tr:not(.noResultsMessage):hover {\n    background-color: var(--blue_0);\n  }\n\n  table tbody td {\n    color: var(--neutral_6);\n    border-bottom: 1px solid var(--neutral_0);\n    box-sizing: border-box;\n    font-size: 13px;\n    padding: 18px 28px;\n    text-align: left;\n    vertical-align: middle;\n  }\n\n  .hasBorder tr:last-of-type td {\n    border-bottom: none;\n  }\n\n  .hasBorder thead tr:first-child th:first-child,\n  .hasBorder.noHeader tbody tr:first-child td:first-child {\n    border-top-left-radius: 4px;\n  }\n\n  .hasBorder thead tr:first-child th:last-child,\n  .hasBorder.noHeader tbody tr:first-child td:last-child {\n    border-top-right-radius: 4px;\n  }\n\n  .hasBorder tbody tr:last-child td:first-child {\n    border-bottom-left-radius: 4px;\n  }\n\n  .hasBorder tbody tr:last-child td:last-child {\n    border-bottom-right-radius: 4px;\n  }\n',
				},
			],
		},
		{
			type: 'text',
			value: '\n\n\n',
		},
		{
			type: 'svelteElement',
			tagName: 'div',
			properties: [
				{
					type: 'svelteProperty',
					name: 'class',
					value: [
						{
							type: 'text',
							value: 'wrapper',
						},
					],
					modifiers: [],
					shorthand: 'none',
				},
			],
			selfClosing: false,
			children: [
				{
					type: 'text',
					value: '\n  ',
				},
				{
					type: 'svelteElement',
					tagName: 'div',
					properties: [
						{
							type: 'svelteProperty',
							name: 'class',
							value: [
								{
									type: 'text',
									value: 'table',
								},
								{
									type: 'text',
									value: '',
								},
								{
									type: 'svelteExpression',
									value: ' ClassNames ',
								},
							],
							modifiers: [],
							shorthand: 'none',
						},
					],
					selfClosing: false,
					children: [
						{
							type: 'text',
							value: '\n    ',
						},
						{
							type: 'svelteElement',
							tagName: 'table',
							properties: [],
							selfClosing: false,
							children: [
								{
									type: 'text',
									value: '\n\n      ',
								},
								{
									type: 'svelteElement',
									tagName: 'colgroup',
									properties: [],
									selfClosing: false,
									children: [
										{
											type: 'text',
											value: '\n        ',
										},
										{
											type: 'svelteBranchingBlock',
											name: 'each',
											branches: [
												{
													type: 'svelteBranch',
													name: 'each',
													expression: {
														type: 'svelteExpression',
														value: 'columns as col ',
													},
													children: [
														{
															type: 'text',
															value: '\n        ',
														},
														{
															type: 'svelteElement',
															tagName: 'col',
															properties: [
																{
																	type: 'svelteProperty',
																	name: 'style',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: ' colWidth(col) ',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',
																},
															],
															selfClosing: true,
															children: [],
														},
														{
															type: 'text',
															value: '\n        ',
														},
													],
												},
											],
										},
										{
											type: 'text',
											value: '\n      ',
										},
									],
								},
								{
									type: 'text',
									value: '\n\n      ',
								},
								{
									type: 'svelteBranchingBlock',
									name: 'if',
									branches: [
										{
											type: 'svelteBranch',
											name: 'if',
											expression: {
												type: 'svelteExpression',
												value: 'showHeader ',
											},
											children: [
												{
													type: 'text',
													value: '\n      ',
												},
												{
													type: 'svelteElement',
													tagName: 'thead',
													properties: [],
													selfClosing: false,
													children: [
														{
															type: 'text',
															value: '\n        ',
														},
														{
															type: 'svelteElement',
															tagName: 'tr',
															properties: [],
															selfClosing: false,
															children: [
																{
																	type: 'text',
																	value: '\n          ',
																},
																{
																	type: 'svelteBranchingBlock',
																	name: 'each',
																	branches: [
																		{
																			type: 'svelteBranch',
																			name: 'each',
																			expression: {
																				type: 'svelteExpression',
																				value: 'columns as headerItem ',
																			},
																			children: [
																				{
																					type: 'text',
																					value: '\n          ',
																				},
																				{
																					type: 'svelteElement',
																					tagName: 'th',
																					properties: [
																						{
																							type: 'svelteProperty',
																							name: 'style',
																							value: [
																								{
																									type: 'svelteExpression',
																									value:
																										' cellAlign(headerItem) ',
																								},
																							],
																							modifiers: [],
																							shorthand: 'none',
																						},
																					],
																					selfClosing: false,
																					children: [
																						{
																							type: 'text',
																							value: '\n            ',
																						},
																						{
																							type: 'svelteBranchingBlock',
																							name: 'if',
																							branches: [
																								{
																									type: 'svelteBranch',
																									name: 'if',
																									expression: {
																										type: 'svelteExpression',
																										value: 'headerItem.sort ',
																									},
																									children: [
																										{
																											type: 'text',
																											value: '\n            ',
																										},
																										{
																											type: 'svelteElement',
																											tagName: 'span',
																											properties: [
																												{
																													type:
																														'svelteDirective',
																													name: 'on',
																													value: [
																														{
																															type:
																																'svelteExpression',
																															value:
																																'() => sort(headerItem)',
																														},
																													],
																													modifiers: [],
																													shorthand: 'none',

																													specifier: 'click',
																												},
																												{
																													type:
																														'svelteProperty',
																													name: 'class',
																													value: [
																														{
																															type: 'text',
																															value: 'sort',
																														},
																														{
																															type: 'text',
																															value: '',
																														},
																														{
																															type:
																																'svelteExpression',
																															value:
																																' sortClassNames(headerItem.sort, headerItem.cell, activeSort, activeSortDirection) ',
																														},
																													],
																													modifiers: [],
																													shorthand: 'none',
																												},
																											],
																											selfClosing: false,
																											children: [
																												{
																													type: 'text',
																													value:
																														'\n              ',
																												},
																												{
																													type:
																														'svelteBranchingBlock',
																													name: 'if',
																													branches: [
																														{
																															type:
																																'svelteBranch',
																															name: 'if',
																															expression: {
																																type:
																																	'svelteExpression',
																																value:
																																	'headerItem.title.component ',
																															},
																															children: [
																																{
																																	type: 'text',
																																	value:
																																		'\n              ',
																																},
																																{
																																	type:
																																		'svelteMeta',
																																	tagName:
																																		'component',
																																	properties: [
																																		{
																																			type:
																																				'svelteProperty',
																																			name:
																																				'this',
																																			value: [
																																				{
																																					type:
																																						'svelteExpression',
																																					value:
																																						'headerItem.title.component',
																																				},
																																			],
																																			modifiers: [],
																																			shorthand:
																																				'none',
																																		},
																																		{
																																			type:
																																				'svelteProperty',
																																			name:
																																				'...headerItem.title.props',
																																			value: [
																																				{
																																					type:
																																						'svelteExpression',
																																					value:
																																						'...headerItem.title.props',
																																				},
																																			],
																																			modifiers: [],
																																			shorthand:
																																				'expression',
																																		},
																																	],
																																	selfClosing: true,
																																	children: [],
																																},
																																{
																																	type: 'text',
																																	value:
																																		'\n              ',
																																},
																															],
																														},
																														{
																															type:
																																'svelteBranch',
																															name: 'else',
																															expression: {
																																type:
																																	'svelteExpression',
																																value: '',
																															},
																															children: [
																																{
																																	type: 'text',
																																	value:
																																		'\n              ',
																																},
																																{
																																	type:
																																		'svelteVoidBlock',
																																	name: 'html',
																																	expression: {
																																		type:
																																			'svelteExpression',
																																		value:
																																			'headerItem.title ',
																																	},
																																},
																																{
																																	type: 'text',
																																	value:
																																		'\n              ',
																																},
																															],
																														},
																													],
																												},
																												{
																													type: 'text',
																													value:
																														'\n            ',
																												},
																											],
																										},
																										{
																											type: 'text',
																											value: '\n            ',
																										},
																									],
																								},
																								{
																									type: 'svelteBranch',
																									name: 'else',
																									expression: {
																										type: 'svelteExpression',
																										value: '',
																									},
																									children: [
																										{
																											type: 'text',
																											value: '\n            ',
																										},
																										{
																											type:
																												'svelteBranchingBlock',
																											name: 'if',
																											branches: [
																												{
																													type: 'svelteBranch',
																													name: 'if',
																													expression: {
																														type:
																															'svelteExpression',
																														value:
																															'headerItem.title.component ',
																													},
																													children: [
																														{
																															type: 'text',
																															value:
																																'\n            ',
																														},
																														{
																															type:
																																'svelteMeta',
																															tagName:
																																'component',
																															properties: [
																																{
																																	type:
																																		'svelteProperty',
																																	name: 'this',
																																	value: [
																																		{
																																			type:
																																				'svelteExpression',
																																			value:
																																				'headerItem.title.component',
																																		},
																																	],
																																	modifiers: [],
																																	shorthand:
																																		'none',
																																},
																																{
																																	type:
																																		'svelteProperty',
																																	name:
																																		'...headerItem.title.data',
																																	value: [
																																		{
																																			type:
																																				'svelteExpression',
																																			value:
																																				'...headerItem.title.data',
																																		},
																																	],
																																	modifiers: [],
																																	shorthand:
																																		'expression',
																																},
																															],
																															selfClosing: true,
																															children: [],
																														},
																														{
																															type: 'text',
																															value:
																																'\n            ',
																														},
																													],
																												},
																												{
																													type: 'svelteBranch',
																													name: 'else',
																													expression: {
																														type:
																															'svelteExpression',
																														value: '',
																													},
																													children: [
																														{
																															type: 'text',
																															value:
																																'\n            ',
																														},
																														{
																															type:
																																'svelteVoidBlock',
																															name: 'html',
																															expression: {
																																type:
																																	'svelteExpression',
																																value:
																																	'headerItem.title ',
																															},
																														},
																														{
																															type: 'text',
																															value:
																																'\n            ',
																														},
																													],
																												},
																											],
																										},
																										{
																											type: 'text',
																											value: '\n            ',
																										},
																									],
																								},
																							],
																						},
																						{
																							type: 'text',
																							value: '\n          ',
																						},
																					],
																				},
																				{
																					type: 'text',
																					value: '\n          ',
																				},
																			],
																		},
																	],
																},
																{
																	type: 'text',
																	value: '\n        ',
																},
															],
														},
														{
															type: 'text',
															value: '\n      ',
														},
													],
												},
												{
													type: 'text',
													value: '\n      ',
												},
											],
										},
									],
								},
								{
									type: 'text',
									value: '\n      ',
								},
								{
									type: 'svelteElement',
									tagName: 'tbody',
									properties: [],
									selfClosing: false,
									children: [
										{
											type: 'text',
											value: '\n        ',
										},
										{
											type: 'svelteBranchingBlock',
											name: 'if',
											branches: [
												{
													type: 'svelteBranch',
													name: 'if',
													expression: {
														type: 'svelteExpression',
														value: 'Data.length <= 0 && !isLoading ',
													},
													children: [
														{
															type: 'text',
															value: ' \n          ',
														},
														{
															type: 'svelteElement',
															tagName: 'tr',
															properties: [
																{
																	type: 'svelteProperty',
																	name: 'class',
																	value: [
																		{
																			type: 'text',
																			value: 'noResultsMessage',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',
																},
															],
															selfClosing: false,
															children: [
																{
																	type: 'text',
																	value: '\n            ',
																},
																{
																	type: 'svelteElement',
																	tagName: 'td',
																	properties: [
																		{
																			type: 'svelteProperty',
																			name: 'colspan',
																			value: [
																				{
																					type: 'svelteExpression',
																					value: ' columns.length ',
																				},
																			],
																			modifiers: [],
																			shorthand: 'none',
																		},
																	],
																	selfClosing: false,
																	children: [
																		{
																			type: 'text',
																			value: '\n              ',
																		},
																		{
																			type: 'svelteElement',
																			tagName: 'slot',
																			properties: [
																				{
																					type: 'svelteProperty',
																					name: 'name',
																					value: [
																						{
																							type: 'text',
																							value: 'noResults',
																						},
																					],
																					modifiers: [],
																					shorthand: 'none',
																				},
																			],
																			selfClosing: false,
																			children: [
																				{
																					type: 'svelteExpression',
																					value: 'noResultsMessage ',
																				},
																			],
																		},
																		{
																			type: 'text',
																			value: '\n            ',
																		},
																	],
																},
																{
																	type: 'text',
																	value: '\n          ',
																},
															],
														},
														{
															type: 'text',
															value: '\n          ',
														},
													],
												},
											],
										},
										{
											type: 'text',
											value: '\n\n          ',
										},
										{
											type: 'svelteBranchingBlock',
											name: 'each',
											branches: [
												{
													type: 'svelteBranch',
													name: 'each',
													expression: {
														type: 'svelteExpression',
														value: 'Data as row ',
													},
													children: [
														{
															type: 'text',
															value: '\n          ',
														},
														{
															type: 'svelteElement',
															tagName: 'tr',
															properties: [
																{
																	type: 'svelteProperty',
																	name: 'class',
																	value: [
																		{
																			type: 'svelteExpression',
																			value:
																				" rowCssClass ? rowCssClass(row) : '' ",
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',
																},
																{
																	type: 'svelteDirective',
																	name: 'on',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: '() => onRowClick(row)',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',

																	specifier: 'click',
																},
															],
															selfClosing: false,
															children: [
																{
																	type: 'text',
																	value: '\n            ',
																},
																{
																	type: 'svelteBranchingBlock',
																	name: 'each',
																	branches: [
																		{
																			type: 'svelteBranch',
																			name: 'each',
																			expression: {
																				type: 'svelteExpression',
																				value: 'columns as item ',
																			},
																			children: [
																				{
																					type: 'text',
																					value: '\n            ',
																				},
																				{
																					type: 'svelteElement',
																					tagName: 'td',
																					properties: [
																						{
																							type: 'svelteProperty',
																							name: 'style',
																							value: [
																								{
																									type: 'svelteExpression',
																									value: ' cellAlign(item) ',
																								},
																							],
																							modifiers: [],
																							shorthand: 'none',
																						},
																					],
																					selfClosing: false,
																					children: [
																						{
																							type: 'text',
																							value: '\n              ',
																						},
																						{
																							type: 'svelteBranchingBlock',
																							name: 'if',
																							branches: [
																								{
																									type: 'svelteBranch',
																									name: 'if',
																									expression: {
																										type: 'svelteExpression',
																										value:
																											"typeof item.cell === 'function' ",
																									},
																									children: [
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																										{
																											type: 'svelteVoidBlock',
																											name: 'html',
																											expression: {
																												type:
																													'svelteExpression',
																												value:
																													'item.cell(row) ',
																											},
																										},
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																									],
																								},
																								{
																									type: 'svelteBranch',
																									name: 'else if',
																									expression: {
																										type: 'svelteExpression',
																										value:
																											'item.cell.component ',
																									},
																									children: [
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																										{
																											type: 'svelteMeta',
																											tagName: 'component',
																											properties: [
																												{
																													type:
																														'svelteProperty',
																													name: 'this',
																													value: [
																														{
																															type:
																																'svelteExpression',
																															value:
																																'item.cell.component',
																														},
																													],
																													modifiers: [],
																													shorthand: 'none',
																												},
																												{
																													type:
																														'svelteProperty',
																													name:
																														'...item.cell.props',
																													value: [
																														{
																															type:
																																'svelteExpression',
																															value:
																																'...item.cell.props',
																														},
																													],
																													modifiers: [],
																													shorthand:
																														'expression',
																												},
																												{
																													type:
																														'svelteProperty',
																													name: 'item',
																													value: [
																														{
																															type:
																																'svelteExpression',
																															value: 'row',
																														},
																													],
																													modifiers: [],
																													shorthand: 'none',
																												},
																											],
																											selfClosing: true,
																											children: [],
																										},
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																									],
																								},
																								{
																									type: 'svelteBranch',
																									name: 'else',
																									expression: {
																										type: 'svelteExpression',
																										value: '',
																									},
																									children: [
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																										{
																											type: 'svelteVoidBlock',
																											name: 'html',
																											expression: {
																												type:
																													'svelteExpression',
																												value:
																													'row[item.cell] ',
																											},
																										},
																										{
																											type: 'text',
																											value: '\n              ',
																										},
																									],
																								},
																							],
																						},
																						{
																							type: 'text',
																							value: '\n            ',
																						},
																					],
																				},
																				{
																					type: 'text',
																					value: '\n            ',
																				},
																			],
																		},
																	],
																},
																{
																	type: 'text',
																	value: '\n          ',
																},
															],
														},
														{
															type: 'text',
															value: '\n          ',
														},
													],
												},
											],
										},
										{
											type: 'text',
											value: '\n      ',
										},
									],
								},
								{
									type: 'text',
									value: '\n    ',
								},
							],
						},
						{
							type: 'text',
							value: '\n  ',
						},
					],
				},
				{
					type: 'text',
					value: '\n\n  ',
				},
				{
					type: 'svelteBranchingBlock',
					name: 'if',
					branches: [
						{
							type: 'svelteBranch',
							name: 'if',
							expression: {
								type: 'svelteExpression',
								value: 'hasPagination ',
							},
							children: [
								{
									type: 'text',
									value: '\n  ',
								},
								{
									type: 'svelteBranchingBlock',
									name: 'if',
									branches: [
										{
											type: 'svelteBranch',
											name: 'if',
											expression: {
												type: 'svelteExpression',
												value: 'itemTotal > 0 && currentPage > 0 ',
											},
											children: [
												{
													type: 'text',
													value: '\n  ',
												},
												{
													type: 'svelteElement',
													tagName: 'div',
													properties: [
														{
															type: 'svelteProperty',
															name: 'class',
															value: [
																{
																	type: 'text',
																	value: 'pagination',
																},
															],
															modifiers: [],
															shorthand: 'none',
														},
													],
													selfClosing: false,
													children: [
														{
															type: 'text',
															value: '\n    ',
														},
														{
															type: 'svelteComponent',
															tagName: 'Pagination',
															properties: [
																{
																	type: 'svelteDirective',
																	name: 'on',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: 'onChange',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',

																	specifier: 'change',
																},
																{
																	type: 'svelteDirective',
																	name: 'bind',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: 'pageSize',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',

																	specifier: 'pageSize',
																},
																{
																	type: 'svelteDirective',
																	name: 'bind',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: 'currentPage',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',

																	specifier: 'current',
																},
																{
																	type: 'svelteProperty',
																	name: 'total',
																	value: [
																		{
																			type: 'svelteExpression',
																			value: ' itemTotal ',
																		},
																	],
																	modifiers: [],
																	shorthand: 'none',
																},
															],
															selfClosing: false,
															children: [
																{
																	type: 'text',
																	value: '\n    ',
																},
															],
														},
														{
															type: 'text',
															value: '\n  ',
														},
													],
												},
												{
													type: 'text',
													value: '\n  ',
												},
											],
										},
									],
								},
								{
									type: 'text',
									value: '\n  ',
								},
							],
						},
					],
				},
				{
					type: 'text',
					value: '\n \n  ',
				},
				{
					type: 'svelteBranchingBlock',
					name: 'if',
					branches: [
						{
							type: 'svelteBranch',
							name: 'if',
							expression: {
								type: 'svelteExpression',
								value: 'isLoading ',
							},
							children: [
								{
									type: 'text',
									value: '\n  ',
								},
								{
									type: 'svelteElement',
									tagName: 'div',
									properties: [
										{
											type: 'svelteProperty',
											name: 'class',
											value: [
												{
													type: 'text',
													value: 'loader',
												},
											],
											modifiers: [],
											shorthand: 'none',
										},
									],
									selfClosing: false,
									children: [
										{
											type: 'text',
											value: '\n    ',
										},
										{
											type: 'svelteElement',
											tagName: 'div',
											properties: [
												{
													type: 'svelteProperty',
													name: 'class',
													value: [
														{
															type: 'text',
															value: 'loader_spinner',
														},
													],
													modifiers: [],
													shorthand: 'none',
												},
											],
											selfClosing: false,
											children: [
												{
													type: 'text',
													value: '\n      ',
												},
												{
													type: 'svelteComponent',
													tagName: 'Spinner',
													properties: [],
													selfClosing: false,
													children: [],
												},
												{
													type: 'text',
													value: '\n    ',
												},
											],
										},
										{
											type: 'text',
											value: '\n  ',
										},
									],
								},
								{
									type: 'text',
									value: '\n  ',
								},
							],
						},
					],
				},
				{
					type: 'text',
					value: '\n',
				},
			],
		},
	],
};
