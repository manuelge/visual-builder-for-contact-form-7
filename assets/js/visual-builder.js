/**
 * Visual Builder for Contact Form 7 - editor screen.
 *
 * The form template text (CodeMirror, or the plain textarea when syntax highlighting is
 * disabled) is the single source of truth. The visual side splits that text into blocks
 * (chunks separated by blank lines, keeping HTML elements together), shows a preview of
 * each block rendered by Contact Form 7 and edits the text back when blocks are moved,
 * duplicated, edited or deleted. Nothing outside the edited block is ever rewritten.
 */
/* global jQuery, wp, wpecf7vbSettings */
( function ( $ ) {
	'use strict';

	const S = window.wpecf7vbSettings;
	if ( ! S ) {
		return;
	}
	const T = S.i18n;

	const VOID_TAGS = new Set( [ 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' ] );
	const RAW_TAGS = new Set( [ 'script', 'style', 'textarea' ] );
	const NAME_RE = /^[A-Za-z][-A-Za-z0-9_:.]*$/;
	const RENDER_DELAY = 350;

	const escapeRe = ( s ) => s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	const sprintf = ( str, n ) => str.replace( '%d', n );
	const speak = ( msg ) => {
		if ( wp && wp.a11y && wp.a11y.speak ) {
			wp.a11y.speak( msg );
		}
	};

	/* ------------------------------------------------------------------ *
	 * Template parsing
	 * ------------------------------------------------------------------ */

	/**
	 * Updates the element nesting depth with the tags found in one line.
	 */
	function scanLine( line, state ) {
		let i = 0;
		while ( i < line.length ) {
			if ( state.raw ) {
				const closer = '--' === state.raw ? '-->' : '</' + state.raw;
				const at = line.toLowerCase().indexOf( closer, i );
				if ( at < 0 ) {
					return;
				}
				i = at + closer.length;
				if ( '--' !== state.raw ) {
					state.depth = Math.max( 0, state.depth - 1 );
				}
				state.raw = null;
				continue;
			}
			const lt = line.indexOf( '<', i );
			if ( lt < 0 ) {
				return;
			}
			if ( line.startsWith( '<!--', lt ) ) {
				state.raw = '--';
				i = lt + 4;
				continue;
			}
			const m = /^<(\/?)([a-zA-Z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/.exec( line.slice( lt ) );
			if ( ! m ) {
				i = lt + 1;
				continue;
			}
			const name = m[ 2 ].toLowerCase();
			if ( m[ 1 ] ) {
				state.depth = Math.max( 0, state.depth - 1 );
			} else if ( ! m[ 3 ] && ! VOID_TAGS.has( name ) ) {
				state.depth++;
				if ( RAW_TAGS.has( name ) ) {
					state.raw = name;
				}
			}
			i = lt + m[ 0 ].length;
		}
	}

	/* Elements that start a new block even without a blank line before them. */
	const BLOCK_START_RE = /^\s*<(label|p|div|fieldset|h[1-6]|ul|ol|dl|table|section|article|aside|header|footer|figure|blockquote|pre|hr|details|style|script)\b/i;

	/**
	 * Splits the template into blocks: runs of lines separated by blank lines, except
	 * blank lines inside an open HTML element, a comment or a script/style. A line that
	 * opens a block element (<label>, <p>, <div>…) or a form-tag right after a line that
	 * closed everything also starts a new block, so two labels or two form-tags on
	 * consecutive lines are two blocks. "Label text" followed by a form-tag stays together.
	 *
	 * @return {Array<{start:number,end:number,text:string}>}
	 */
	function splitBlocks( text ) {
		const blocks = [];
		const state = { depth: 0, raw: null };
		let pos = 0;
		let start = -1;
		let end = -1;
		let prevClosed = false;

		text.split( '\n' ).forEach( ( line ) => {
			const lineStart = pos;
			const lineEnd = pos + line.length;
			pos = lineEnd + 1;

			const outside = state.depth <= 0 && ! state.raw;
			if ( '' === line.trim() && outside ) {
				if ( start >= 0 ) {
					blocks.push( { start, end } );
					start = -1;
				}
				return;
			}
			if ( start >= 0 && outside && prevClosed && ( BLOCK_START_RE.test( line ) || startsWithTag( line ) ) ) {
				blocks.push( { start, end } );
				start = -1;
			}
			if ( start < 0 ) {
				start = lineStart;
			}
			end = lineEnd;
			scanLine( line, state );
			// The line ends with a tag or a form-tag: nothing is left open on it.
			prevClosed = /[>\]]\s*$/.test( line );
		} );

		if ( start >= 0 ) {
			blocks.push( { start, end } );
		}

		return blocks.map( ( b ) => ( { start: b.start, end: b.end, text: text.slice( b.start, b.end ) } ) );
	}

	const tagTypes = ( S.tagTypes || [] ).slice().sort( ( a, b ) => b.length - a.length );
	const namedTypes = new Set( S.namedTypes || [] );
	const TAG_RE = tagTypes.length
		? new RegExp(
			'(\\[?)\\[(' + tagTypes.map( escapeRe ).join( '|' ) + ')(?:\\s+(.*?))?(?:\\s+(\\/))?\\](?:([^[]*?)\\[\\/\\2\\])?(\\]?)',
			'g'
		)
		: null;
	const TAG_START_RE = tagTypes.length
		? new RegExp( '^\\s*\\[(' + tagTypes.map( escapeRe ).join( '|' ) + ')[\\s\\]]' )
		: null;

	/** True when the line begins with a form-tag, e.g. "[text* your-name]". */
	function startsWithTag( line ) {
		return !! TAG_START_RE && TAG_START_RE.test( line );
	}

	/**
	 * Same split as Contact Form 7: options first, then quoted values. Null when unreadable.
	 */
	function parseAtts( attr ) {
		const text = ( attr || '' ).replace( /[ ​]+/g, ' ' ).trim();
		const m = /^([-+*=0-9a-zA-Z:.!?#$&@_/|%\s]*?)((?:\s*"[^"]*"|\s*'[^']*')*)$/.exec( text );
		if ( ! m ) {
			return null;
		}
		return {
			options: m[ 1 ].trim() ? m[ 1 ].trim().split( /\s+/ ) : [],
			values: ( m[ 2 ].match( /"[^"]*"|'[^']*'/g ) || [] ).map( ( v ) => v.slice( 1, -1 ) ),
		};
	}

	/**
	 * Form-tags of a text, with their offsets.
	 */
	function parseTags( text ) {
		const tags = [];
		if ( ! TAG_RE ) {
			return tags;
		}
		TAG_RE.lastIndex = 0;
		let m;
		while ( ( m = TAG_RE.exec( text ) ) ) {
			if ( '[' === m[ 1 ] && ']' === m[ 6 ] ) {
				continue; // [[escaped]] tag.
			}
			const start = m.index + m[ 1 ].length;
			const end = m.index + m[ 0 ].length - m[ 6 ].length;
			const type = m[ 2 ];
			const basetype = type.replace( /\*$/, '' );
			const atts = parseAtts( m[ 3 ] );
			const tag = {
				start,
				end,
				raw: text.slice( start, end ),
				type,
				basetype,
				required: type !== basetype,
				canRequire: tagTypes.includes( basetype + '*' ),
				named: namedTypes.has( type ),
				enclosing: undefined !== m[ 5 ],
				content: undefined !== m[ 5 ] ? m[ 5 ] : '',
				atts,
				name: '',
			};
			if ( atts && tag.named ) {
				tag.name = atts.options.length ? atts.options[ 0 ] : '';
				tag.options = atts.options.slice( 1 );
			} else if ( atts ) {
				tag.options = atts.options.slice();
			}
			tags.push( tag );
		}
		return tags;
	}

	function buildTag( tag, f ) {
		const type = tag.basetype + ( f.required ? '*' : '' );
		const parts = [ type ];
		if ( tag.named && f.name ) {
			parts.push( f.name );
		}
		f.options.split( /\s+/ ).filter( Boolean ).forEach( ( o ) => parts.push( o ) );
		f.values.split( '\n' ).map( ( v ) => v.trim() ).filter( ( v ) => '' !== v ).forEach( ( v ) => {
			parts.push( '"' + v.replace( /"/g, '”' ) + '"' );
		} );
		let out = '[' + parts.join( ' ' ) + ']';
		if ( tag.enclosing ) {
			out += f.content + '[/' + type + ']';
		}
		return out;
	}

	/* Form-tags that get no label field: no visible field, or they carry their own text. */
	const NO_LABEL_TYPES = new Set( [ 'hidden', 'acceptance', 'quiz', 'submit' ] );
	/* A <label> around a group of choices would send every click to the first one. */
	const LEGEND_TYPES = new Set( [ 'checkbox', 'radio' ] );

	const decodeText = ( s ) => {
		const t = document.createElement( 'textarea' );
		t.innerHTML = s;
		return t.value;
	};
	const encodeText = ( s ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );

	/**
	 * Label of a block that holds a single form-tag: the bare tag, a <label> around it
	 * (Contact Form 7 default) or a <fieldset> with a <legend>. Null for any other markup.
	 */
	function readLabel( source, tag ) {
		const before = source.slice( 0, tag.start );
		const after = source.slice( tag.end );
		if ( ! before.trim() && ! after.trim() ) {
			return { kind: 'none', text: '' };
		}
		let m = /^\s*<label(\s[^>]*)?>([^<]*)$/i.exec( before );
		if ( m && /^\s*<\/label>\s*$/i.test( after ) ) {
			return { kind: 'label', attrs: m[ 1 ] || '', text: decodeText( m[ 2 ] ).trim() };
		}
		m = /^\s*<fieldset(\s[^>]*)?>\s*<legend(\s[^>]*)?>([^<]*)<\/legend>\s*$/i.exec( before );
		if ( m && /^\s*<\/fieldset>\s*$/i.test( after ) ) {
			return { kind: 'fieldset', attrs: m[ 1 ] || '', legendAttrs: m[ 2 ] || '', text: decodeText( m[ 3 ] ).trim() };
		}
		return null;
	}

	/**
	 * Block source for a form-tag with the given label, in the Contact Form 7 default format.
	 * An empty label leaves the bare form-tag.
	 */
	function writeLabel( tagRaw, basetype, info, text ) {
		text = text.trim();
		if ( ! text ) {
			return tagRaw;
		}
		let kind = info.kind;
		if ( 'none' === kind ) {
			kind = LEGEND_TYPES.has( basetype ) ? 'fieldset' : 'label';
		}
		if ( 'fieldset' === kind ) {
			return '<fieldset' + ( info.attrs || '' ) + '>\n    <legend' + ( info.legendAttrs || '' ) + '>' +
				encodeText( text ) + '</legend>\n    ' + tagRaw + '\n</fieldset>';
		}
		return '<label' + ( info.attrs || '' ) + '> ' + encodeText( text ) + '\n    ' + tagRaw + ' </label>';
	}

	/* ------------------------------------------------------------------ *
	 * Source: CodeMirror or the plain textarea
	 * ------------------------------------------------------------------ */

	const Source = {
		cm: null,
		ta: null,
		history: [],

		init( textarea, onChange, onCursor ) {
			this.ta = textarea;
			if ( S.codeEditor && wp.codeEditor ) {
				this.cm = wp.codeEditor.initialize( textarea, S.codeEditor ).codemirror;
				this.cm.on( 'change', () => {
					this.cm.save();
					onChange();
				} );
				this.cm.on( 'cursorActivity', onCursor );
				this.cm.getWrapperElement().classList.add( 'wpecf7vb-cm' );
			} else {
				textarea.addEventListener( 'input', onChange );
				[ 'click', 'keyup', 'focus' ].forEach( ( ev ) => textarea.addEventListener( ev, onCursor ) );
				this.onChange = onChange;
			}
		},

		get() {
			return this.cm ? this.cm.getValue() : this.ta.value;
		},

		/** Replaces [from, to) with text as a single undoable change. */
		replace( from, to, text ) {
			if ( this.cm ) {
				const doc = this.cm.getDoc();
				doc.replaceRange( text, doc.posFromIndex( from ), doc.posFromIndex( to ), '+wpecf7vb' );
				return;
			}
			const value = this.ta.value;
			this.history.push( value );
			this.ta.value = value.slice( 0, from ) + text + value.slice( to );
			this.onChange();
		},

		undo() {
			if ( this.cm ) {
				this.cm.undo();
			} else if ( this.history.length ) {
				this.ta.value = this.history.pop();
				this.onChange();
			}
		},

		cursor() {
			if ( this.cm ) {
				const doc = this.cm.getDoc();
				return doc.indexFromPos( doc.getCursor() );
			}
			return this.ta.selectionEnd || 0;
		},

		hasFocus() {
			return this.cm ? this.cm.hasFocus() : document.activeElement === this.ta;
		},

		/** Selects and reveals a range of the source. */
		reveal( from, to ) {
			if ( this.cm ) {
				const doc = this.cm.getDoc();
				const a = doc.posFromIndex( from );
				const b = doc.posFromIndex( to );
				if ( this.mark ) {
					this.mark.clear();
				}
				this.mark = doc.markText( { line: a.line, ch: 0 }, { line: b.line + 1, ch: 0 }, { className: 'wpecf7vb-cm-mark' } );
				doc.setSelection( b, b, { scroll: false } );
				this.cm.scrollIntoView( { from: a, to: b }, 40 );
				return;
			}
			this.ta.setSelectionRange( from, to );
		},

		clearMark() {
			if ( this.mark ) {
				this.mark.clear();
				this.mark = null;
			}
		},

		refresh() {
			if ( this.cm ) {
				this.cm.refresh();
			}
		},
	};

	/* ------------------------------------------------------------------ *
	 * Builder
	 * ------------------------------------------------------------------ */

	const Builder = {
		blocks: [],
		gaps: [],
		cache: new Map(),
		pending: new Set(),
		failed: false,
		selected: -1,
		target: null, // Index of the block new form-tags go after, null = code cursor.
		dragging: false,
		silentCursor: false,
		renderTimer: null,
		renderSeq: 0,

		init() {
			this.root = document.getElementById( 'wpecf7vb' );
			this.list = document.getElementById( 'wpecf7vb-blocks' );
			this.empty = this.root.querySelector( '.wpecf7vb-empty' );
			this.status = this.root.querySelector( '.wpecf7vb-status' );

			Source.init(
				document.getElementById( 'wpcf7-form' ),
				() => this.onSourceChange(),
				() => this.onCursor()
			);

			this.buildInsertHint();
			this.bindViews();
			this.bindTheme();
			this.bindList();
			this.bindTagGenerator();
			this.watchPanel();

			this.parse();
			this.paint();
			this.requestRender( true );
			this.root.classList.remove( 'is-loading' );
		},

		/* ---------- model ---------- */

		parse() {
			const text = Source.get();
			this.blocks = splitBlocks( text );
			const n = this.blocks.length;
			this.gaps = [];
			for ( let i = 0; i <= n; i++ ) {
				const from = i ? this.blocks[ i - 1 ].end : 0;
				const to = i < n ? this.blocks[ i ].start : text.length;
				this.gaps.push( text.slice( from, to ) );
			}
			if ( this.selected >= n ) {
				this.selected = -1;
			}
			if ( null !== this.target && this.target >= n ) {
				this.setTarget( null );
			}
		},

		onSourceChange() {
			if ( ! this.silentCursor ) {
				Source.clearMark();
			}
			this.parse();
			if ( ! this.dragging ) {
				this.paint();
			}
			this.requestRender( false );
		},

		onCursor() {
			if ( this.silentCursor || ! Source.hasFocus() ) {
				return;
			}
			const at = Source.cursor();
			const index = this.blocks.findIndex( ( b ) => at >= b.start && at <= b.end );
			this.setTarget( null );
			this.select( index, false );
			if ( index >= 0 ) {
				const li = this.cardAt( index );
				if ( li ) {
					li.scrollIntoView( { block: 'nearest' } );
				}
			}
		},

		/** Rewrites the text between the first and the last block with blocks in a new order. */
		reorder( order ) {
			const n = this.blocks.length;
			let middle = '';
			order.forEach( ( from, k ) => {
				middle += this.blocks[ from ].text + ( k < n - 1 ? this.gaps[ k + 1 ] : '' );
			} );
			Source.replace( this.blocks[ 0 ].start, this.blocks[ n - 1 ].end, middle );
		},

		move( index, to ) {
			const n = this.blocks.length;
			if ( to < 0 || to >= n || to === index ) {
				return;
			}
			const order = [ ...Array( n ).keys() ];
			order.splice( to, 0, order.splice( index, 1 )[ 0 ] );
			this.reorder( order );
			this.afterStructuralChange( to );
			speak( sprintf( T.moved, to + 1 ) );
		},

		remove( index ) {
			const b = this.blocks[ index ];
			const next = this.blocks[ index + 1 ];
			const prev = this.blocks[ index - 1 ];
			if ( next ) {
				Source.replace( b.start, next.start, '' );
			} else if ( prev ) {
				Source.replace( prev.end, b.end, '' );
			} else {
				Source.replace( b.start, b.end, '' );
			}
			this.afterStructuralChange( Math.min( index, this.blocks.length - 1 ) );
			this.toast( T.deleted, true );
		},

		duplicate( index ) {
			const b = this.blocks[ index ];
			Source.replace( b.end, b.end, '\n\n' + b.text );
			this.afterStructuralChange( index + 1 );
			this.toast( T.duplicated, true );
		},

		replaceBlock( index, text ) {
			const b = this.blocks[ index ];
			Source.replace( b.start, b.end, text );
			this.afterStructuralChange( index );
			this.toast( T.updated, true );
		},

		insertTag( tag ) {
			if ( null !== this.target && this.blocks[ this.target ] ) {
				const b = this.blocks[ this.target ];
				Source.replace( b.end, b.end, '\n\n' + tag );
				this.afterStructuralChange( this.target + 1 );
			} else {
				const at = Source.cursor();
				// Same as Contact Form 7: a tag added at the very top gets its own block.
				if ( 0 === at && Source.get().trim() ) {
					tag += '\n\n';
				}
				Source.replace( at, at, tag );
				const index = this.blocks.findIndex( ( b ) => at >= b.start && at <= b.end + tag.length );
				this.afterStructuralChange( index );
			}
			speak( T.inserted );
		},

		afterStructuralChange( index ) {
			this.parse();
			this.paint();
			if ( index >= 0 && this.blocks[ index ] ) {
				this.select( index, true );
				if ( null !== this.target ) {
					this.setTarget( index );
				}
				const li = this.cardAt( index );
				if ( li ) {
					li.classList.remove( 'is-flash' );
					void li.offsetWidth; // Restart the animation.
					li.classList.add( 'is-flash' );
					li.scrollIntoView( { block: 'nearest' } );
				}
			}
		},

		select( index, reveal ) {
			this.selected = index;
			this.list.querySelectorAll( '.wpecf7vb-block' ).forEach( ( li ) => {
				li.classList.toggle( 'is-selected', +li.dataset.index === index );
			} );
			if ( reveal && index >= 0 ) {
				const b = this.blocks[ index ];
				this.silentCursor = true;
				Source.reveal( b.start, b.end );
				this.silentCursor = false;
			}
		},

		setTarget( index ) {
			this.target = index;
			if ( ! this.hint ) {
				return;
			}
			if ( null === index ) {
				this.hint.textContent = this.hintText.cursor;
				this.hint.classList.remove( 'is-block' );
			} else {
				this.hint.textContent = sprintf( this.hintText.block, index + 1 );
				this.hint.classList.add( 'is-block' );
			}
		},

		cardAt( index ) {
			return this.list.querySelector( '.wpecf7vb-block[data-index="' + index + '"]' );
		},

		/* ---------- rendering ---------- */

		requestRender( now ) {
			clearTimeout( this.renderTimer );
			this.renderTimer = setTimeout( () => this.fetchPreviews(), now ? 0 : RENDER_DELAY );
		},

		fetchPreviews() {
			const missing = [ ...new Set( this.blocks.map( ( b ) => b.text ) ) ].filter( ( t ) => ! this.cache.has( t ) );
			if ( ! missing.length ) {
				this.setStatus();
				return;
			}
			const seq = ++this.renderSeq;
			this.setStatus( 'busy' );

			const body = new URLSearchParams();
			body.append( 'action', 'wpecf7vb_render' );
			body.append( 'nonce', S.nonce );
			body.append( 'post_id', S.postId );
			body.append( 'blocks', JSON.stringify( missing ) );

			fetch( S.ajaxUrl, { method: 'POST', credentials: 'same-origin', body } )
				.then( ( r ) => r.json() )
				.then( ( json ) => {
					if ( ! json || ! json.success ) {
						throw new Error( 'render' );
					}
					missing.forEach( ( text, i ) => this.cache.set( text, json.data.html[ i ] || '' ) );
					if ( this.cache.size > 800 ) {
						this.cache = new Map( [ ...this.cache ].slice( -400 ) );
					}
					this.failed = false;
					if ( seq === this.renderSeq && ! this.dragging ) {
						this.fillPreviews();
					}
					this.setStatus();
				} )
				.catch( () => {
					this.failed = true;
					this.setStatus( 'error' );
				} );
		},

		setStatus( state ) {
			const el = this.status;
			el.textContent = '';
			el.className = 'wpecf7vb-status';
			if ( 'busy' === state ) {
				el.classList.add( 'is-busy' );
				el.textContent = T.rendering;
			} else if ( 'error' === state ) {
				el.classList.add( 'is-error' );
				el.append( T.renderError + ' ' );
				const retry = document.createElement( 'button' );
				retry.type = 'button';
				retry.className = 'button-link';
				retry.textContent = T.retry;
				retry.addEventListener( 'click', () => this.fetchPreviews() );
				el.append( retry );
			} else {
				el.textContent = 1 === this.blocks.length ? T.oneBlock : sprintf( T.blocksCount, this.blocks.length );
			}
		},

		/**
		 * Builds the list reusing the cards of unchanged blocks, so previews do not flicker.
		 */
		paint() {
			const reuse = new Map();
			this.list.querySelectorAll( ':scope > .wpecf7vb-block' ).forEach( ( li ) => {
				const key = li._wpecf7vbText;
				if ( ! reuse.has( key ) ) {
					reuse.set( key, [] );
				}
				reuse.get( key ).push( li );
			} );

			const n = this.blocks.length;
			const fragment = document.createDocumentFragment();
			this.blocks.forEach( ( block, i ) => {
				const pool = reuse.get( block.text );
				const li = pool && pool.length ? pool.shift() : this.createCard( block );
				this.updateCard( li, i, n );
				fragment.append( li );
			} );
			reuse.forEach( ( pool ) => pool.forEach( ( li ) => li.remove() ) );
			this.list.append( fragment );

			this.empty.hidden = n > 0;
			this.list.hidden = 0 === n;
			this.fillPreviews();
			if ( ! this.status.classList.contains( 'is-busy' ) && ! this.failed ) {
				this.setStatus();
			}
		},

		createCard( block ) {
			const li = document.createElement( 'li' );
			li.className = 'wpecf7vb-block';
			li.tabIndex = 0;
			li._wpecf7vbText = block.text;

			const bar = document.createElement( 'div' );
			bar.className = 'wpecf7vb-block__bar';

			const handle = document.createElement( 'span' );
			handle.className = 'wpecf7vb-block__handle dashicons dashicons-move';
			handle.title = T.drag;
			handle.setAttribute( 'aria-hidden', 'true' );

			const chips = document.createElement( 'span' );
			chips.className = 'wpecf7vb-block__chips';
			this.fillChips( chips, block.text );

			const actions = document.createElement( 'span' );
			actions.className = 'wpecf7vb-block__actions';
			[
				[ 'up', 'dashicons-arrow-up-alt2', T.moveUp ],
				[ 'down', 'dashicons-arrow-down-alt2', T.moveDown ],
				[ 'edit', 'dashicons-edit', T.edit ],
				[ 'duplicate', 'dashicons-admin-page', T.duplicate ],
				[ 'delete', 'dashicons-trash', T.delete ],
			].forEach( ( [ action, icon, label ] ) => {
				const btn = document.createElement( 'button' );
				btn.type = 'button';
				btn.className = 'wpecf7vb-action wpecf7vb-action--' + action;
				btn.dataset.action = action;
				btn.title = label;
				btn.setAttribute( 'aria-label', label );
				btn.innerHTML = '<span class="dashicons ' + icon + '" aria-hidden="true"></span>';
				actions.append( btn );
			} );

			bar.append( handle, chips, actions );

			const preview = document.createElement( 'div' );
			preview.className = 'wpecf7vb-block__preview';
			preview.inert = true;

			li.append( bar, preview );
			return li;
		},

		fillChips( el, text ) {
			const tags = parseTags( text );
			el.textContent = '';
			const add = ( label, cls ) => {
				const chip = document.createElement( 'span' );
				chip.className = 'wpecf7vb-chip ' + ( cls || '' );
				chip.textContent = label;
				el.append( chip );
			};
			if ( ! tags.length ) {
				const code = /^\s*<(style|script)\b/i.exec( text );
				if ( code ) {
					add( 'style' === code[ 1 ].toLowerCase() ? 'CSS' : 'JS', 'wpecf7vb-chip--muted' );
				} else {
					add( /<[a-z!]/i.test( text ) ? T.html : T.text, 'wpecf7vb-chip--muted' );
				}
				return;
			}
			tags.slice( 0, 3 ).forEach( ( tag ) => {
				const chip = document.createElement( 'span' );
				chip.className = 'wpecf7vb-chip wpecf7vb-chip--' + tag.basetype.replace( /[^a-z0-9_-]/gi, '' );
				const type = document.createElement( 'b' );
				type.textContent = tag.basetype;
				chip.append( type );
				if ( tag.required ) {
					const req = document.createElement( 'span' );
					req.className = 'wpecf7vb-chip__req';
					req.title = T.required;
					req.textContent = '*';
					chip.append( req );
				}
				if ( tag.name ) {
					chip.append( ' ' + tag.name );
				}
				el.append( chip );
			} );
			if ( tags.length > 3 ) {
				add( '+' + ( tags.length - 3 ), 'wpecf7vb-chip--muted' );
			}
		},

		updateCard( li, i, n ) {
			li.dataset.index = i;
			const summary = [ ...li.querySelectorAll( '.wpecf7vb-chip' ) ].map( ( c ) => c.textContent ).join( ', ' );
			li.setAttribute( 'aria-label', T.block + ' ' + ( i + 1 ) + ': ' + summary );
			li.classList.toggle( 'is-selected', i === this.selected );
			li.classList.toggle( 'is-target', i === this.target );
			li.querySelector( '[data-action="up"]' ).disabled = 0 === i;
			li.querySelector( '[data-action="down"]' ).disabled = i === n - 1;
		},

		fillPreviews() {
			this.list.querySelectorAll( ':scope > .wpecf7vb-block' ).forEach( ( li ) => {
				const text = li._wpecf7vbText;
				if ( ! this.cache.has( text ) ) {
					li.classList.add( 'is-pending' );
					return;
				}
				if ( li._wpecf7vbFilled ) {
					return;
				}
				li.classList.remove( 'is-pending' );
				li._wpecf7vbFilled = true;
				Builder.fillPreview( li.querySelector( '.wpecf7vb-block__preview' ), this.cache.get( text ), text );
			} );
		},

		/**
		 * Inserts rendered HTML, detached from the admin form: fields lose their names so
		 * they are never submitted with the contact form settings.
		 */
		fillPreview( el, html, text ) {
			const code = /^\s*<(style|script)\b/i.exec( text );
			if ( code ) {
				// Sanitized output keeps the CSS/JS as plain text: describe the block instead.
				el.textContent = '';
				el.classList.add( 'is-empty' );
				const note = document.createElement( 'div' );
				note.className = 'wpecf7vb-block__note';
				note.textContent = 'style' === code[ 1 ].toLowerCase() ? T.styleBlock : T.scriptBlock;
				el.append( note );
				return;
			}
			const tpl = document.createElement( 'template' );
			tpl.innerHTML = html;
			tpl.content.querySelectorAll( '[name], [id], [for], [required], [autofocus], [tabindex]' ).forEach( ( node ) => {
				[ 'name', 'id', 'for', 'required', 'autofocus', 'tabindex' ].forEach( ( a ) => node.removeAttribute( a ) );
			} );
			tpl.content.querySelectorAll( 'input[type="submit"], button' ).forEach( ( node ) => node.setAttribute( 'type', 'button' ) );

			el.textContent = '';
			el.append( tpl.content );

			const visible = el.textContent.trim() || el.querySelector( 'input, select, textarea, button, img, iframe, hr' );
			el.classList.toggle( 'is-empty', ! visible );
			if ( ! visible ) {
				const note = document.createElement( 'div' );
				note.className = 'wpecf7vb-block__note';
				note.textContent = T.emptyPreview;
				const code = document.createElement( 'code' );
				code.textContent = text.split( '\n' )[ 0 ].slice( 0, 80 );
				note.append( ' ', code );
				el.append( note );
			}
		},

		/* ---------- UI bindings ---------- */

		bindList() {
			const list = this.list;

			list.addEventListener( 'click', ( e ) => {
				const li = e.target.closest( '.wpecf7vb-block' );
				if ( ! li ) {
					return;
				}
				const index = +li.dataset.index;
				const btn = e.target.closest( '[data-action]' );
				if ( ! btn ) {
					this.select( index, true );
					this.setTarget( index );
					this.paintTarget();
					return;
				}
				switch ( btn.dataset.action ) {
					case 'up':
						this.move( index, index - 1 );
						break;
					case 'down':
						this.move( index, index + 1 );
						break;
					case 'edit':
						Editor.open( index );
						break;
					case 'duplicate':
						this.duplicate( index );
						break;
					case 'delete':
						this.remove( index );
						break;
				}
				this.refocus( btn.dataset.action );
			} );

			list.addEventListener( 'dblclick', ( e ) => {
				const li = e.target.closest( '.wpecf7vb-block' );
				if ( li && ! e.target.closest( '[data-action]' ) ) {
					Editor.open( +li.dataset.index );
				}
			} );

			list.addEventListener( 'keydown', ( e ) => {
				const li = e.target;
				if ( ! li.classList || ! li.classList.contains( 'wpecf7vb-block' ) ) {
					return;
				}
				const index = +li.dataset.index;
				if ( e.altKey && ( 'ArrowUp' === e.key || 'ArrowDown' === e.key ) ) {
					e.preventDefault();
					this.move( index, index + ( 'ArrowUp' === e.key ? -1 : 1 ) );
					this.focusCard( this.selected );
				} else if ( 'ArrowUp' === e.key || 'ArrowDown' === e.key ) {
					e.preventDefault();
					this.focusCard( index + ( 'ArrowUp' === e.key ? -1 : 1 ) );
				} else if ( 'Delete' === e.key ) {
					e.preventDefault();
					this.remove( index );
					this.focusCard( this.selected );
				} else if ( 'Enter' === e.key ) {
					e.preventDefault();
					Editor.open( index );
				}
			} );

			$( list ).sortable( {
				items: '> .wpecf7vb-block',
				handle: '.wpecf7vb-block__bar',
				cancel: 'button',
				axis: 'y',
				tolerance: 'pointer',
				placeholder: 'wpecf7vb-block-placeholder',
				forcePlaceholderSize: true,
				scroll: true,
				start: ( e, ui ) => {
					this.dragging = true;
					// With axis "y" jQuery UI never sets "left" and the absolute card falls back to
					// its static position, which some layouts resolve to the container edge. Pin it
					// over the gap it left (the placeholder) instead.
					ui.item.css( {
						left: ui.placeholder.position().left + 'px',
						width: ui.placeholder.outerWidth() + 'px',
					} );
					ui.item.addClass( 'is-dragging' );
				},
				stop: ( e, ui ) => {
					ui.item.removeClass( 'is-dragging' ).css( { left: '', width: '' } );
					const order = [ ...list.querySelectorAll( ':scope > .wpecf7vb-block' ) ].map( ( li ) => +li.dataset.index );
					const to = order.indexOf( +ui.item[ 0 ].dataset.index );
					this.dragging = false;
					if ( order.some( ( v, k ) => v !== k ) ) {
						this.reorder( order );
						this.afterStructuralChange( to );
						speak( sprintf( T.moved, to + 1 ) );
					}
				},
			} );
		},

		refocus( action ) {
			if ( 'edit' === action ) {
				return;
			}
			const li = this.cardAt( this.selected );
			if ( ! li ) {
				return;
			}
			const btn = li.querySelector( '[data-action="' + action + '"]' );
			( btn && ! btn.disabled ? btn : li ).focus( { preventScroll: true } );
		},

		focusCard( index ) {
			const li = this.cardAt( index );
			if ( li ) {
				li.focus();
			}
		},

		paintTarget() {
			this.list.querySelectorAll( '.wpecf7vb-block' ).forEach( ( li ) => {
				li.classList.toggle( 'is-target', +li.dataset.index === this.target );
			} );
		},

		buildInsertHint() {
			const bar = this.root.querySelector( '.wpecf7vb-taggen' );
			if ( ! bar ) {
				return;
			}
			this.hintText = { cursor: T.insertCursor, block: T.insertAfter };
			this.hint = document.createElement( 'button' );
			this.hint.type = 'button';
			this.hint.className = 'wpecf7vb-insert-hint';
			this.hint.addEventListener( 'click', () => {
				this.setTarget( null );
				this.paintTarget();
			} );
			bar.append( this.hint );
			this.setTarget( null );
		},

		bindTagGenerator() {
			let before = null;
			let cursor = 0;
			let target = null;
			document.querySelectorAll( '[data-taggen="open-dialog"]' ).forEach( ( btn ) => {
				btn.addEventListener( 'click', () => {
					before = Source.get();
					cursor = Source.cursor();
					target = this.target;
				} );
			} );
			document.querySelectorAll( 'dialog.tag-generator-dialog' ).forEach( ( dialog ) => {
				dialog.addEventListener( 'close', () => {
					const tag = ( dialog.returnValue || '' ).trim();
					if ( ! tag ) {
						return;
					}
					// Contact Form 7 writes the tag into the textarea at its own cursor. Undo that
					// and insert it where the builder says (after the selected block or at the cursor).
					setTimeout( () => {
						// Contact Form 7 focuses the textarea on close, which would reset the target.
						this.setTarget( target );
						this.paintTarget();
						if ( Source.cm ) {
							this.insertTag( tag );
							Source.cm.save();
						} else {
							if ( null !== before ) {
								Source.ta.value = before;
								Source.ta.setSelectionRange( cursor, cursor );
							}
							this.insertTag( tag );
						}
						before = null;
					}, 0 );
				} );
			} );
		},

		bindViews() {
			const buttons = this.root.querySelectorAll( '.wpecf7vb-segmented [data-view]' );
			buttons.forEach( ( btn ) => {
				btn.addEventListener( 'click', () => this.setView( btn.dataset.view, true ) );
				btn.addEventListener( 'keydown', ( e ) => {
					if ( 'ArrowRight' !== e.key && 'ArrowLeft' !== e.key ) {
						return;
					}
					const all = [ ...buttons ];
					const next = all[ ( all.indexOf( btn ) + ( 'ArrowRight' === e.key ? 1 : all.length - 1 ) ) % all.length ];
					next.focus();
					this.setView( next.dataset.view, true );
				} );
			} );
			this.setView( this.root.dataset.view, false );
		},

		setView( view, save ) {
			this.root.dataset.view = view;
			this.root.querySelectorAll( '.wpecf7vb-segmented [data-view]' ).forEach( ( btn ) => {
				const on = btn.dataset.view === view;
				btn.setAttribute( 'aria-checked', on ? 'true' : 'false' );
				btn.tabIndex = on ? 0 : -1;
			} );
			Source.refresh();
			if ( save ) {
				this.savePrefs( { view } );
			}
		},

		bindTheme() {
			const select = document.getElementById( 'wpecf7vb-theme' );
			if ( ! select || ! Source.cm ) {
				return;
			}
			select.addEventListener( 'change', () => {
				Source.cm.setOption( 'theme', select.value || 'default' );
				// Keeps Contact Form 7's "unsaved changes" check quiet: this is not form data.
				[ ...select.options ].forEach( ( o ) => ( o.defaultSelected = o.selected ) );
				this.savePrefs( { theme: select.value } );
			} );
		},

		/**
		 * Debounced, and always sends the whole state: quick successive changes end up
		 * in a single request, so they cannot be saved out of order.
		 */
		savePrefs( prefs ) {
			Object.assign( S.prefs, prefs );
			clearTimeout( this.prefsTimer );
			this.prefsTimer = setTimeout( () => {
				const body = new URLSearchParams( {
					action: 'wpecf7vb_prefs',
					nonce: S.nonce,
					view: S.prefs.view,
					theme: S.prefs.theme,
				} );
				fetch( S.ajaxUrl, { method: 'POST', credentials: 'same-origin', body, keepalive: true } ).catch( () => {} );
			}, 400 );
		},

		/** CodeMirror needs a refresh when the Form tab becomes visible. */
		watchPanel() {
			const panel = document.getElementById( 'form-panel' );
			if ( ! panel || ! window.MutationObserver ) {
				return;
			}
			new MutationObserver( () => {
				if ( ! panel.hidden ) {
					Source.refresh();
				}
			} ).observe( panel, { attributes: true, attributeFilter: [ 'hidden' ] } );
		},

		toast( message, undoable ) {
			speak( message );
			if ( ! this.toastEl ) {
				this.toastEl = document.createElement( 'div' );
				this.toastEl.className = 'wpecf7vb-toast';
				this.toastEl.setAttribute( 'role', 'status' );
				this.root.append( this.toastEl );
			}
			const el = this.toastEl;
			el.textContent = '';
			const text = document.createElement( 'span' );
			text.textContent = message;
			el.append( text );
			if ( undoable ) {
				const btn = document.createElement( 'button' );
				btn.type = 'button';
				btn.className = 'wpecf7vb-toast__undo';
				btn.textContent = T.undo;
				btn.addEventListener( 'click', () => {
					Source.undo();
					el.classList.remove( 'is-visible' );
				} );
				el.append( btn );
			}
			el.classList.add( 'is-visible' );
			clearTimeout( this.toastTimer );
			this.toastTimer = setTimeout( () => el.classList.remove( 'is-visible' ), 6000 );
		},
	};

	/* ------------------------------------------------------------------ *
	 * Block editor (modal)
	 * ------------------------------------------------------------------ */

	const Editor = {
		index: -1,

		build() {
			if ( this.dialog ) {
				return;
			}
			const d = document.createElement( 'dialog' );
			d.className = 'wpecf7vb-modal';
			d.setAttribute( 'aria-labelledby', 'wpecf7vb-modal-title' );
			d.innerHTML =
				'<div class="wpecf7vb-modal__head">' +
					'<h2 id="wpecf7vb-modal-title"></h2>' +
					'<button type="button" class="wpecf7vb-modal__close" data-close><span class="dashicons dashicons-no-alt" aria-hidden="true"></span></button>' +
				'</div>' +
				'<div class="wpecf7vb-modal__body">' +
					'<div class="wpecf7vb-modal__fields">' +
						'<div class="wpecf7vb-modal__tags"></div>' +
						'<label class="wpecf7vb-field wpecf7vb-field--source"><span class="wpecf7vb-field__label"></span>' +
						'<textarea class="code" rows="6" spellcheck="false"></textarea><span class="wpecf7vb-field__help"></span></label>' +
					'</div>' +
					'<div class="wpecf7vb-modal__preview"><div class="wpecf7vb-modal__preview-title"></div><div class="wpecf7vb-block__preview"></div></div>' +
				'</div>' +
				'<div class="wpecf7vb-modal__foot">' +
					'<button type="button" class="button" data-close></button>' +
					'<button type="button" class="button button-primary" data-apply></button>' +
				'</div>';
			document.body.append( d );

			d.querySelector( '#wpecf7vb-modal-title' ).textContent = T.editBlock;
			d.querySelector( '.wpecf7vb-modal__close' ).setAttribute( 'aria-label', T.close );
			d.querySelector( '.wpecf7vb-field--source .wpecf7vb-field__label' ).textContent = T.source;
			d.querySelector( '.wpecf7vb-field--source .wpecf7vb-field__help' ).textContent = T.sourceHelp;
			d.querySelector( '.wpecf7vb-modal__preview-title' ).textContent = T.preview;
			d.querySelector( '.wpecf7vb-modal__foot [data-close]' ).textContent = T.cancel;
			d.querySelector( '[data-apply]' ).textContent = T.apply;

			this.dialog = d;
			this.tagsEl = d.querySelector( '.wpecf7vb-modal__tags' );
			this.source = d.querySelector( '.wpecf7vb-field--source textarea' );
			this.preview = d.querySelector( '.wpecf7vb-modal__preview .wpecf7vb-block__preview' );
			this.preview.inert = true;
			this.applyBtn = d.querySelector( '[data-apply]' );

			d.querySelectorAll( '[data-close]' ).forEach( ( b ) => b.addEventListener( 'click', () => d.close() ) );
			d.addEventListener( 'click', ( e ) => {
				if ( e.target === d ) {
					d.close(); // Backdrop click.
				}
			} );
			d.addEventListener( 'close', () => {
				const li = Builder.cardAt( this.index );
				if ( li ) {
					li.focus( { preventScroll: true } );
				}
			} );
			this.applyBtn.addEventListener( 'click', () => this.apply() );
			this.source.addEventListener( 'input', () => {
				this.renderTags();
				this.schedulePreview();
			} );
		},

		open( index ) {
			const block = Builder.blocks[ index ];
			if ( ! block ) {
				return;
			}
			this.build();
			this.index = index;
			this.original = block.text;
			this.source.value = block.text;
			this.renderTags();
			this.updatePreview();
			this.dialog.showModal();
			const first = this.tagsEl.querySelector( 'input:not([type=checkbox]), textarea' ) || this.source;
			first.focus();
		},

		/** One fieldset per form-tag of the block source. */
		renderTags() {
			const tags = parseTags( this.source.value );
			this.tagsEl.textContent = '';
			this.tags = tags;
			this.labelInfo = null;

			if ( ! tags.length ) {
				const p = document.createElement( 'p' );
				p.className = 'wpecf7vb-modal__note';
				p.textContent = T.noTags;
				this.tagsEl.append( p );
				this.validate();
				return;
			}

			tags.forEach( ( tag, k ) => {
				const fs = document.createElement( 'fieldset' );
				fs.className = 'wpecf7vb-tag';
				const legend = document.createElement( 'legend' );
				legend.innerHTML = '<span class="wpecf7vb-chip"><b></b></span>';
				legend.querySelector( 'b' ).textContent = tag.basetype;
				legend.append( ' ' + T.formTag );
				fs.append( legend );

				if ( ! tag.atts ) {
					const p = document.createElement( 'p' );
					p.className = 'wpecf7vb-modal__note';
					p.textContent = T.unparsableTag;
					fs.append( p );
					this.tagsEl.append( fs );
					return;
				}

				if ( 1 === tags.length && tag.named && ! tag.enclosing && ! NO_LABEL_TYPES.has( tag.basetype ) ) {
					const info = readLabel( this.source.value, tag );
					if ( info ) {
						this.labelInfo = info;
						const legend = 'fieldset' === info.kind || ( 'none' === info.kind && LEGEND_TYPES.has( tag.basetype ) );
						fs.append( this.field( 'label', T.label, 'input', info.text, k, legend ? T.legendHelp : T.labelHelp ) );
					}
				}

				const row = document.createElement( 'div' );
				row.className = 'wpecf7vb-tag__row';
				if ( tag.named ) {
					row.append( this.field( 'name', T.name, 'input', tag.name, k ) );
				}
				if ( tag.canRequire ) {
					const label = document.createElement( 'label' );
					label.className = 'wpecf7vb-check';
					const cb = document.createElement( 'input' );
					cb.type = 'checkbox';
					cb.checked = tag.required;
					cb.dataset.part = 'required';
					cb.dataset.tag = k;
					label.append( cb, ' ' + T.required );
					row.append( label );
				}
				fs.append( row );
				fs.append( this.field( 'options', T.options, 'input', tag.options.join( ' ' ), k, T.optionsHelp ) );
				fs.append( this.field( 'values', T.values, 'textarea', tag.atts.values.join( '\n' ), k, T.valuesHelp ) );
				if ( tag.enclosing ) {
					fs.append( this.field( 'content', T.content, 'textarea', tag.content, k ) );
				}

				fs.addEventListener( 'input', () => this.onFieldInput( k ) );
				fs.addEventListener( 'change', () => this.onFieldInput( k ) );
				this.tagsEl.append( fs );
			} );
			this.validate();
		},

		field( part, label, kind, value, k, help ) {
			const wrap = document.createElement( 'label' );
			wrap.className = 'wpecf7vb-field wpecf7vb-field--' + part;
			const span = document.createElement( 'span' );
			span.className = 'wpecf7vb-field__label';
			span.textContent = label;
			const input = document.createElement( kind );
			if ( 'input' === kind ) {
				input.type = 'text';
			} else {
				input.rows = 'values' === part ? 3 : 2;
			}
			if ( 'label' !== part ) {
				input.className = 'code';
				input.spellcheck = false;
			}
			input.value = value;
			input.dataset.part = part;
			input.dataset.tag = k;
			wrap.append( span, input );
			if ( help ) {
				const h = document.createElement( 'span' );
				h.className = 'wpecf7vb-field__help';
				h.textContent = help;
				wrap.append( h );
			}
			if ( 'name' === part ) {
				const err = document.createElement( 'span' );
				err.className = 'wpecf7vb-field__error';
				err.textContent = T.invalidName;
				err.hidden = true;
				wrap.append( err );
			}
			return wrap;
		},

		/** A field changed: rebuild that form-tag inside the block source. */
		onFieldInput( k ) {
			const fs = this.tagsEl.querySelectorAll( '.wpecf7vb-tag' )[ k ];
			const get = ( part ) => fs.querySelector( '[data-part="' + part + '"]' );
			const tag = parseTags( this.source.value )[ k ];
			if ( ! tag || ! tag.atts ) {
				return;
			}
			const f = {
				name: get( 'name' ) ? get( 'name' ).value.trim() : '',
				required: get( 'required' ) ? get( 'required' ).checked : tag.required,
				options: get( 'options' ).value,
				values: get( 'values' ).value,
				content: get( 'content' ) ? get( 'content' ).value : tag.content,
			};
			const text = this.source.value;
			const label = get( 'label' );
			if ( label && this.labelInfo ) {
				// Single form-tag block: rebuild it with its label (or without it, when empty).
				this.source.value = writeLabel( buildTag( tag, f ), tag.basetype, this.labelInfo, label.value );
				const updated = parseTags( this.source.value )[ 0 ];
				this.labelInfo = ( updated && readLabel( this.source.value, updated ) ) || this.labelInfo;
			} else {
				this.source.value = text.slice( 0, tag.start ) + buildTag( tag, f ) + text.slice( tag.end );
			}
			this.validate();
			this.schedulePreview();
		},

		validate() {
			let ok = true;
			this.tagsEl.querySelectorAll( '[data-part="name"]' ).forEach( ( input ) => {
				const valid = NAME_RE.test( input.value.trim() );
				input.setAttribute( 'aria-invalid', valid ? 'false' : 'true' );
				input.parentNode.querySelector( '.wpecf7vb-field__error' ).hidden = valid;
				ok = ok && valid;
			} );
			this.applyBtn.disabled = ! ok;
		},

		schedulePreview() {
			clearTimeout( this.timer );
			this.timer = setTimeout( () => this.updatePreview(), RENDER_DELAY );
		},

		updatePreview() {
			const text = this.source.value;
			const show = ( html ) => {
				if ( text === this.source.value ) {
					Builder.fillPreview( this.preview, html, text );
				}
			};
			if ( Builder.cache.has( text ) ) {
				show( Builder.cache.get( text ) );
				return;
			}
			this.preview.classList.add( 'is-pending' );
			const body = new URLSearchParams( {
				action: 'wpecf7vb_render',
				nonce: S.nonce,
				post_id: S.postId,
				blocks: JSON.stringify( [ text ] ),
			} );
			fetch( S.ajaxUrl, { method: 'POST', credentials: 'same-origin', body } )
				.then( ( r ) => r.json() )
				.then( ( json ) => {
					this.preview.classList.remove( 'is-pending' );
					if ( json && json.success ) {
						Builder.cache.set( text, json.data.html[ 0 ] || '' );
						show( json.data.html[ 0 ] || '' );
					}
				} )
				.catch( () => this.preview.classList.remove( 'is-pending' ) );
		},

		apply() {
			const text = this.source.value.replace( /^\s*\n|\n\s*$/g, '' );
			this.dialog.close();
			if ( text !== this.original ) {
				if ( '' === text.trim() ) {
					Builder.remove( this.index );
				} else {
					Builder.replaceBlock( this.index, text );
				}
			}
		},
	};

	$( () => {
		if ( document.getElementById( 'wpecf7vb' ) && document.getElementById( 'wpcf7-form' ) ) {
			Builder.init();
		}
	} );
}( jQuery ) );
