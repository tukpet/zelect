/*
 zelect-0.0.10

 opts:
 throttle:           ms: delay to throttle filtering of results when search term updated, 0 means synchronous
 loader:             function(term, page, callback): load more items
 callback expects an array of items
 renderItem:         function(item, term): render the content of a single item
 initial:            "item": arbitrary item to set the initial selection to
 placeholder is not required if initial item is provided
 placeholder:        String/DOM/jQuery: placeholder text/html before anything is selected
 zelect automatically selects first item if not provided
 noResults:          function(term?): function to create no results text
 regexpMatcher:      function(term): override regexp creation when filtering options
 selectOnMouseEnter: set selection on mouse enter
 resetWhenOpened:    zelect automatically resets selection state if 'true'
 cssClassPrefix:     prefix for css classes
 */
(function($) {
  var keys = { tab:9, enter:13, esc:27, left:37, up:38, right:39, down:40 }
  var defaults = {
    throttle: 300,
    renderItem: defaultRenderItem,
    noResults: defaultNoResults,
    regexpMatcher: defaultRegexpMatcher,
    selectOnMouseEnter: true,
    resetWhenOpened: false,
    cssClassPrefix: ''
  }

  $.fn.zelect = function(opts) {
    opts = $.extend({}, defaults, opts)

    return this.each(function() {
      if ($(this).parent().length === 0) throw new Error('<select> element must have a parent')
      var $select = $(this).hide().data('zelectItem', selectItem).data('refreshItem', refreshItem).data('reset', reset)

      var $zelect = $('<div>').addClass(prefixedClassName('zelect'))
      var $selected = $('<div>').addClass(prefixedClassName('zelect__zelected'))
      var $dropdown = $('<div>').addClass(prefixedClassName('zelect__dropdown')).hide()
      var $noResults = $('<div>').addClass(prefixedClassName('zelect__dropdown__noResults'))
      var $search = $('<input>').addClass(prefixedClassName('zelect__dropdown__zearch'))
      var $list = $('<ol>')
      var listNavigator = navigable($list, opts.selectOnMouseEnter, $select)

      var itemHandler = opts.loader
        ? infiniteScroll($list, opts.loader, appendItem)
        : selectBased($select, $list, opts.regexpMatcher, appendItem)

      var filter = debounced(function() {
        var term = searchTerm()
        itemHandler.load(term, function() { checkResults(term) })
      }, opts.throttle)

      $search.keyup(function(e) {
        switch (e.which) {
          case keys.esc: hide(); return;
          case keys.up: return;
          case keys.down: return;
          case keys.enter:
            var curr = listNavigator.current().data('zelect-item')
            if (curr) selectItem(curr)
            return
          default: filter()
        }
      })
      $search.keydown(function(e) {
        switch (e.which) {
          case keys.tab: e.preventDefault(); hide(); return;
          case keys.up: e.preventDefault(); listNavigator.prev(); return;
          case keys.down: e.preventDefault(); listNavigator.next(); return;
        }
      })

      $list.on('click', 'li:not(.disabled)', function() { selectItem($(this).data('zelect-item')) })
      $zelect.mouseenter(function() { $zelect.addClass(prefixedClassName('zelect--hover')) })
      $zelect.mouseleave(function() { $zelect.removeClass(prefixedClassName('zelect--hover')) })
      $zelect.attr("tabindex", $select.attr('tabindex'))
      $zelect.blur(function() { if (!$zelect.hasClass(prefixedClassName('zelect--hover'))) hide() })
      $search.blur(function() { if (!$zelect.hasClass(prefixedClassName('zelect--hover'))) hide() })

      $selected.click(toggle)

      $('body').on('click.closeZelect', function(evt) {
        var clickWasOutsideZelect = $(evt.target).closest($zelect).length === 0
        if (clickWasOutsideZelect) hide()
      })

      $zelect.insertAfter($select)
        .append($selected)
        .append($dropdown.append($('<div>').addClass(prefixedClassName('zelect__zearchContainer')).append($search).append($noResults)).append($list))

      if (opts.initial) { // TODO: refactor to more intuitive form
        itemHandler.load($search.val(), function () {
          initialSelection(true)
          $select.trigger('ready')
        })
      } else if (opts.placeholder) {
        usePlaceholder()
      }

      function selectItem(item, triggerChange) {
        renderContent($selected, opts.renderItem(item)).removeClass(prefixedClassName('zelect__placeholder'))
        hide()
        if (item && item.value !== undefined) $select.val(item.value)
        $select.data('zelected', item)
        if (triggerChange == null || triggerChange === true) $select.trigger('change', item)
      }

      function refreshItem(item, identityCheckFn) {
        var eq = function(a, b) { return identityCheckFn(a) === identityCheckFn(b) }
        if (eq($select.data('zelected'), item)) {
          renderContent($selected, opts.renderItem(item))
          $select.data('zelected', item)
        }
        var term = searchTerm()
        $list.find('li').each(function() {
          if (eq($(this).data('zelect-item'), item)) {
            renderContent($(this), opts.renderItem(item, term)).data('zelect-item', item)
          }
        })
      }

      function reset() {
        $search.val('')
        itemHandler.load('', function() {
          initialSelection(false)
        })
      }

      function toggle() {
        $dropdown.toggle()
        $zelect.toggleClass(prefixedClassName('zelect--open'))
        if ($dropdown.is(':visible')) {
          if (opts.resetWhenOpened) reset()
          $search.focus().select()
          itemHandler.check()
          listNavigator.ensure(true)
          listNavigator.ensureTopVisible($list.find(':first'))
        } else {
          if ($selected.hasClass(prefixedClassName('zelect__placeholder'))) $select.trigger('mouseout', listNavigator.current().data('zelect-item'))
        }
      }

      function hide() {
        $dropdown.hide()
        $zelect.removeClass(prefixedClassName('zelect--open'))
        if ($selected.hasClass(prefixedClassName('zelect__placeholder'))) $select.trigger('mouseout', listNavigator.current().data('zelect-item'))
      }

      function renderContent($obj, content) {
        $obj[htmlOrText(content)](content)
        return $obj
        function htmlOrText(x) { return (x instanceof $ || x.nodeType != null) ? 'html' : 'text' }
      }

      function appendItem(item, term) {
        $list.append(renderContent($('<li>').data('zelect-item', item).toggleClass(prefixedClassName('zelect__dropdown__zelectItem--disabled'), !!item.disabled), opts.renderItem(item, term)))
      }

      function checkResults(term) {
        if ($list.children().size() === 0) {
          $noResults.html(opts.noResults(term)).show()
        } else {
          $noResults.hide()
          listNavigator.ensure()
        }
      }

      function searchTerm() { return $.trim($search.val()) }

      function initialSelection(useOptsInitial) {
        var $s = $select.find('option[selected]')
        if (useOptsInitial && opts.initial) {
          selectItem(opts.initial)
        } else if (!opts.loader && $s.size() > 0) {
          selectItem($list.children().eq($s.index()).data('zelect-item'))
        } else if (opts.placeholder) {
          usePlaceholder()
          $list.find(':first').addClass(prefixedClassName('zelect__dropdown__current'))
        } else {
          var first = $list.find(':first').data('zelect-item')
          first !== undefined && first !== null ? selectItem(first) : $selected.html(opts.noResults()).addClass(prefixedClassName('zelect__placeholder'))
        }
        checkResults()
      }

      function usePlaceholder() { $selected.html(opts.placeholder).addClass(prefixedClassName('zelect__placeholder')) }
    })

    function prefixedClassName(className) { return opts.cssClassPrefix + className }

    function selectBased($select, $list, regexpMatcher, appendItemFn) {
      var dummyRegexp = { test: function() { return true } }
      var options = $select.find('option').map(function() { return itemFromOption($(this)) }).get()

      function filter(term) {
        var regexp = (term === '') ? dummyRegexp : regexpMatcher(term)
        $list.empty()
        $.each(options, function(ii, item) {
          if (regexp.test(item.label)) appendItemFn(item, term)
        })
      }
      function itemFromOption($option) {
        return { value: $option.val(), label: $option.text(), disabled: $option.prop('disabled') }
      }
      function newTerm(term, callback) {
        filter(term)
        if (callback) callback()
      }
      return { load:newTerm, check:function() {} }
    }

    function infiniteScroll($list, loadFn, appendItemFn) {
      var state = { id:0, term:'', page:0, loading:false, exhausted:false, callback:undefined }

      $list.scroll(maybeLoadMore)

      function load() {
        if (state.loading || state.exhausted) return
        state.loading = true
        $list.addClass(prefixedClassName('loading'))
        var stateId = state.id
        loadFn(state.term, state.page, function(items) {
          if (stateId !== state.id) return
          if (state.page == 0) $list.empty()
          state.page++
          if (!items || items.length === 0) state.exhausted = true
          $.each(items, function(ii, item) { appendItemFn(item, state.term) })
          state.loading = false
          if (!maybeLoadMore()) {
            if (state.callback) state.callback()
            state.callback = undefined
            $list.removeClass(prefixedClassName('loading'))
          }
        })
      }

      function maybeLoadMore() {
        if (state.exhausted) return false
        var $lastChild = $list.children(':last')
        if ($lastChild.size() === 0) {
          load()
          return true
        } else {
          var lastChildTop = $lastChild.offset().top - $list.offset().top
          var lastChildVisible = lastChildTop < $list.outerHeight()
          if (lastChildVisible) load()
          return lastChildVisible
        }
      }

      function newTerm(term, callback) {
        state = { id:state.id+1, term:term, page:0, loading:false, exhausted:false, callback:callback }
        load()
      }
      return { load:newTerm, check:maybeLoadMore }
    }

    function navigable($list, selectOnMouseEnter, $select) {
      var skipMouseEvent = false
      if(selectOnMouseEnter) {
        $list.on('mouseenter', 'li:not(.disabled)', onMouseEnter)
      } else {
        $list.on('click', 'li:not(.disabled)', onMouseClick)
      }

      function next() {
        var $next = current().next('li:not(.disabled)')
        if (set($next)) ensureBottomVisible($next)
      }
      function prev() {
        var $prev = current().prev('li:not(.disabled)')
        if (set($prev)) ensureTopVisible($prev)
      }
      function current() {
        return $list.find('.' + prefixedClassName('zelect__dropdown__current'))
      }
      function ensure(triggerMouseover) {
        var $current = current()
        if ($current.size() === 0) {
          set($list.find('li:not(.disabled)').eq(0))
        } else if (triggerMouseover) {
          $select.trigger('mouseover', $current.data('zelect-item'))
        }
      }
      function set($item) {
        if ($item.size() === 0) return false
        var $currentItem = current()
        if ($currentItem.size() > 0) {
          $currentItem.removeClass(prefixedClassName('zelect__dropdown__current'))
          $select.trigger('mouseout', $currentItem.data('zelect-item'))
        }
        $item.addClass(prefixedClassName('zelect__dropdown__current'))
        $select.trigger('mouseover', $item.data('zelect-item'))
        return true
      }
      function onMouseEnter() {
        if (skipMouseEvent) {
          skipMouseEvent = false
          return
        }
        set($(this))
      }
      function onMouseClick() {
        set($(this))
      }

      function itemTop($item) {
        return $item.offset().top - $list.offset().top
      }
      function ensureTopVisible($item) {
        var scrollTop = $list.scrollTop()
        var offset = itemTop($item) + scrollTop
        if (scrollTop > offset) {
          moveScroll(offset)
        }
      }
      function ensureBottomVisible($item) {
        var scrollBottom = $list.height()
        var itemBottom = itemTop($item) + $item.outerHeight()
        if (scrollBottom < itemBottom) {
          moveScroll($list.scrollTop() + itemBottom - scrollBottom)
        }
      }
      function moveScroll(offset) {
        $list.scrollTop(offset)
        skipMouseEvent = true
      }
      return { next:next, prev:prev, current:current, ensure:ensure, ensureTopVisible:ensureTopVisible }
    }
  }

  $.fn.zelectItem = callInstance('zelectItem')
  $.fn.refreshZelectItem = callInstance('refreshItem')
  $.fn.resetZelect = callInstance('reset')

  function callInstance(fnName) {
    return function() {
      var args = [].slice.call(arguments)
      return this.each(function() {
        var fn = $(this).data(fnName)
        fn && fn.apply(undefined, args)
      })
    }
  }

  function debounced(callback, wait) {
    var timeout
    return function() {
      var later = function() {
        timeout = null
        callback()
      }
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  function defaultRenderItem(item, term) {
    if (item == undefined || item == null) {
      return ''
    } else if ($.type(item) === 'string') {
      return item
    } else if (item.label) {
      return item.label
    } else if (item.toString) {
      return item.toString()
    } else {
      return item
    }
  }

  function defaultNoResults(term) {
    return "No results for '"+(term || '')+"'"
  }

  function defaultRegexpMatcher(term) {
    return new RegExp('(^|\\s)'+term, 'i')
  }
})(jQuery)
