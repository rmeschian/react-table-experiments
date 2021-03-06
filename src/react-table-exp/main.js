import React, {useEffect, useState, useRef, useCallback, useMemo} from 'react';
import styled from 'styled-components'
import { useTable, useBlockLayout, useExpanded } from 'react-table'
import { FixedSizeList } from 'react-window'
import scrollbarWidth from './scrollbarWidth'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import update from 'immutability-helper'

import CssBaseline from '@material-ui/core/CssBaseline'
import MaUTable from '@material-ui/core/Table'
import TableBody from '@material-ui/core/TableBody'
import TableCell from '@material-ui/core/TableCell'
import TableHead from '@material-ui/core/TableHead'
import TableRow from '@material-ui/core/TableRow'

import makeData from './makeData'

let dragCount = 0;

function Table({ columns, data }) {
  // Use the state and functions returned from useTable to build your UI

  const [records, setRecords] = useState([]);
  const idToRow = useRef({});
  const [isRowLoading, setIsRowLoading] = useState({});

  const handle = useRef();
  const setRecordsDebounced = useCallback((val) => {
    cancelAnimationFrame(handle.currrent);
    handle.current = requestAnimationFrame(() => {
      debugger;
      setRecords(val);
    });
    // clearTimeout(handle.currrent);
    // handle.current = setTimeout(() => {
    //   setRecords(val);
    // });
  }, []);

  useEffect(() => {
    if(records !== data) {
      setRecords(data);
    }
  }, [data]);

  useEffect(() => {
    updateRowIndexes(records);
  }, [records]);

  const updateRowIndexes = useCallback((rows) => {
    idToRow.current={};
    walkRowTree(rows, ({row, parentRow}) => {
      idToRow.current[row.id] = row;
      if(parentRow) {
        row.__parentId = parentRow.id;
      }
    });
  }, []);

  const defaultColumn = React.useMemo(
    () => ({
      width: 150,
    }),
    []
  )

  const scrollBarSize = useMemo(() => scrollbarWidth(), [])

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    totalColumnsWidth,

    state: { expanded },
    toggleRowExpanded
  } = useTable(
    {
      columns,
      data: records,
      defaultColumn,
      autoResetExpanded: false,
      getRowId
    },
    useBlockLayout,
    useExpanded // Use the useExpanded plugin hook
  );


  const expandRow = useCallback(async (parentRow) => {
    // const parentId = getRowId(parentRow);
    // setIsRowLoading({ ...isRowLoading, [parentId]: true });
    // const childData = await loadChildren(parentRow);
    // setIsRowLoading({ ...isRowLoading, [parentId]: false });
    // if (records) {
    //   const p1 = getNestingPathToSplice({
    //     records, 
    //     idToRow,
    //     row: parentRow,
    //     createLeaf: (i) => ({ [i]: { subRows: {$set : childData }} })
    //   });
    //   setRecords(update(records, p1));
    // }
  }, [records, isRowLoading]);

  
  const moveRow = useCallback((id, afterId) => {
    dragCount++;
    // if(dragCount > 1)
    //   return;
debugger;
    const row = idToRow.current[id];
    const afterRow = idToRow.current[afterId];

    const p1 = getNestingPathToSplice({
      records, 
      idToRow,
      row, 
      createLeaf: (i) => ({ $splice : [[i, 1]] })
    });

    // -------------------------------------------
    // BUG - FIXME - this looks wrong to me...
    // find the row before the drop index
    // and that's the parent (or perhaps a sibling)...?
    let newParentId;
    const p2 = getNestingPathToSplice({
      records, 
      idToRow,
      row: afterRow, 
      createLeaf: (i, parentRow) => {
        newParentId = parentRow && parentRow.id;
        return { $splice: [[i, 0, row]] }
      }
    });
    row.__parentId = newParentId; // update the parent reference
    // -------------------------------------------

    const u1 = update(records, p1);
    const u2 = update(u1, p2);
    debugger;
    setRecordsDebounced(u2)
  }, [idToRow, records]);

  const RenderRow = useCallback(({ index, style }) => {
      const row = rows[index];
      prepareRow(row);

      return <Row 
        row={row}
        index={index}
        style={style}
        moveRow={moveRow}
        toggleRowExpanded={toggleRowExpanded}
        expandRow={expandRow}
        isLoading={isRowLoading[row.id]}
      />;
    }, [rows, moveRow, toggleRowExpanded, expandRow, isRowLoading]);

  // Render the UI for your table
  return (
    <DndProvider backend={HTML5Backend}>
      <MaUTable component="div" {...getTableProps()} className="table">
        <TableHead component="div">
          {headerGroups.map(headerGroup => (
            <TableRow component="div" {...headerGroup.getHeaderGroupProps()} className="tr">
              {headerGroup.headers.map(column => (
                <TableCell  component="div" {...column.getHeaderProps()} className="th" variant="head">
                  {column.render('Header')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableHead>

        <TableBody component="div" {...getTableBodyProps()}>
          <FixedSizeList
            height={400}
            itemCount={rows.length}
            itemSize={55}
            width={totalColumnsWidth+scrollBarSize}
          >
            {RenderRow}
          </FixedSizeList>
        </TableBody>
      </MaUTable>
    </DndProvider>
  )
}

const DND_ITEM_TYPE = 'row';

function Row({
  row, 
  index, 
  moveRow, 
  toggleRowExpanded, 
  isLoading,
  expandRow,
  style
}) {

  const rowId = getRowId(row);
  const dropRef = useRef(null)
  const dragRef = useRef(null)

  const [, drop] = useDrop({
    accept: DND_ITEM_TYPE,
    canDrop({draggedId}) {
      console.log("dragging: "+draggedId+" over: "+rowId);
      return true;
    },
    hover(item, monitor) {
      if(monitor.canDrop()) {
        if (!dropRef.current) {
          return
        }
        // expand if has children that can be dropped uppon
        // if(expanded[rowId]) {
        //   toggleRowExpanded(rowId, true);
        // }
        const {draggedId} = item;
        if (draggedId !== rowId) {
            moveRow(draggedId, rowId);
        }
      }
    }
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_ITEM_TYPE,
    item: { 
      type: DND_ITEM_TYPE, 
      index, 
      draggedId: getRowId(row)
    },
    collect: (monitor, props) => ({
      handlerId: monitor.getHandlerId(),
      isDragging: monitor.isDragging(),
    }),
    canDrag(monitor) {
      // if can be dragged and has children, collapse before dragging
      if(row.subRows && row.subRows.length) {
        toggleRowExpanded(rowId, false);
      }
      return true;
    }
  })

  const opacity = isDragging ? 0 : 1;
  preview(drop(dropRef));
  drag(dragRef);

  return (
    <TableRow   
      ref={dropRef}
      component="div"
      {...row.getRowProps({
        style,
      })}
      className="tr"
    >
      <TableCell ref={dragRef}  component="div">move</TableCell>
      {row.cells.map(cell => {
        return (
          <TableCell component="div" {...cell.getCellProps()} className="td">
            {cell.render('Cell', {
              isLoading,
              async onExpandClick(event) {
                const toggleRowExpandedProps = row.getToggleRowExpandedProps();
                if (!isLoading) {
                  if (!row.isExpanded) {
                    await expandRow(row);
                  }
                  toggleRowExpandedProps.onClick(event);
                }
              }
            })
          }</TableCell>
        )
      })}
    </TableRow>
  );
}

function App() {
  const columns = React.useMemo(
    () => [
      {
        // Build our expander column
        id: 'expander', // Make sure it has an ID
        Header: ({ getToggleAllRowsExpandedProps, isAllRowsExpanded }) => (
          <span {...getToggleAllRowsExpandedProps()}>
            {isAllRowsExpanded ? '????' : '????'}
          </span>
        ),
        Cell: ({ row, isLoading, onExpandClick }) => {
          if (isLoading) {
            return <span>????</span>
          }

          return (
            <span
              {...row.getToggleRowExpandedProps({
                style: {
                  paddingLeft: `${row.depth}rem`,
                },
              })}
              onClick={onExpandClick}
            >
              {row.isExpanded ? '????' : '??????'}
            </span>
          );
        }
      },
      {
        Header: 'ID',
        accessor: 'id',
      },
      {
        Header: 'First Name',
        accessor: 'firstName',
      },
      {
        Header: 'Last Name',
        accessor: 'lastName',
      },
      {
        Header: 'Age',
        accessor: 'age',
      },
      {
        Header: 'Visits',
        accessor: 'visits',
      },
      {
        Header: 'Status',
        accessor: 'status',
      },
      {
        Header: 'Profile Progress',
        accessor: 'progress',
      },
    ],
    []
  )

  const data = React.useMemo(() => makeData(100000), [])

  return (
    <div>
      <Table columns={columns} data={data} />
    </div>
  )
}

// ======================================================

function getRowId(row) {
  return row.id
}

function getNestingPathToSplice({
  records, 
  row: targetRow, 
  createLeaf,
  idToRow
}) {
let nesting = undefined;
const f2 = (row) => {
  const parentRow = row.__parentId && idToRow.current[row.__parentId];
  const arr = parentRow ? parentRow.subRows : records;
  const index = arr.findIndex(a => a.id === row.id);
  
  if(!nesting) {
    nesting = createLeaf(index, parentRow);
  } else {
    nesting = {
      [index]: {
        subRows: nesting
      }
    };
  }
  if(parentRow)
    f2(parentRow);
};
f2(targetRow);
return nesting;
}

/**
* Calls the given function with each row in the given data
*/
function walkRowTree(data, fn) {
if(data === undefined)
  return;

if(!Array.isArray(data))
  data = [data];

  const f = (arr, parentRow) => {
    for(let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if(fn({row, parentRow}))
        return true;
      if(row.subRows && row.subRows.length && f(row.subRows, row))
        return true;
    }
    return false;
  };
  f(data);
}

export default App
