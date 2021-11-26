import React, {useEffect, useState, useRef, useCallback} from 'react'
import { useTable, useExpanded } from 'react-table'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import update from 'immutability-helper'

import CssBaseline from '@material-ui/core/CssBaseline'
import MaUTable from '@material-ui/core/Table'
import TableBody from '@material-ui/core/TableBody'
import TableCell from '@material-ui/core/TableCell'
import TableHead from '@material-ui/core/TableHead'
import TableRow from '@material-ui/core/TableRow'

import { FixedSizeList } from 'react-window'
import scrollbarWidth from './scrollbarWidth'


import makeData from './makeData'

const getRowId = row => {
  return row.id
};

const Table = ({ columns, data, loadChildren }) => {
  const [records, setRecords] = useState([]);
  const idToRow = useRef({});
  const [isRowLoading, setIsRowLoading] = useState({});

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

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    state: { expanded },
    toggleRowExpanded
  } = useTable({
    data: records,
    columns,
    autoResetExpanded: false,
    getRowId,
    isRowLoading
  },
  useExpanded // Use the useExpanded plugin hook
  );

  const expandRow = async (parentRow) => {
    const parentId = getRowId(parentRow);
    setIsRowLoading({ [parentId]: true });
    const childData = await loadChildren(parentRow);
    setIsRowLoading({ [parentId]: false });
    if (records) {
      const p1 = getNestingPathToSplice({
        records, 
        idToRow,
        row: parentRow,
        createLeaf: (i) => ({ [i]: { subRows: {$set : childData }} })
      });
      setRecords(update(records, p1));
    }
  }

  const moveRow = (id, afterId) => {
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

    setRecords(u2);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <MaUTable {...getTableProps()} stickyHeader>
        <TableHead>
          {headerGroups.map(headerGroup => (
            <TableRow {...headerGroup.getHeaderGroupProps()}>
              <TableCell></TableCell>
              {headerGroup.headers.map(column => (
                <TableCell {...column.getHeaderProps()}>{column.render('Header')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableHead>
        <TableBody {...getTableBodyProps()}>
          {rows.map(
            (row, index) =>
              prepareRow(row) || (
                <Row
                  row={row}
                  index={index}
                  moveRow={moveRow}
                  {...row.getRowProps()}
                  toggleRowExpanded={toggleRowExpanded}
                  expandRow={expandRow}
                  isLoading={isRowLoading[row.id]}
                />
              )
          )}
        </TableBody>
      </MaUTable>
    </DndProvider>
  )
}

const DND_ITEM_TYPE = 'row'

const Row = ({ 
  row, 
  index, 
  moveRow, 
  toggleRowExpanded, 
  isLoading,
  expandRow 
}) => {
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

  const opacity = isDragging ? 0 : 1
  preview(drop(dropRef))
  drag(dragRef)

  return (
    <TableRow ref={dropRef} style={{ opacity }}>
      <TableCell ref={dragRef}>move</TableCell>
      {row.cells.map(cell => {
        return <TableCell {...cell.getCellProps()}>{cell.render('Cell', {
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
        })}</TableCell>
      })}   
    </TableRow>
  )
}

// =========================================

const App = () => {
  const columns = React.useMemo(() => [
      {
        // Build our expander column
        id: 'expander', // Make sure it has an ID
        Header: ({ getToggleAllRowsExpandedProps, isAllRowsExpanded }) => (
          <span {...getToggleAllRowsExpandedProps()}>
            {isAllRowsExpanded ? '👇' : '👉'}
          </span>
        ),
        Cell: ({ row, isLoading, onExpandClick }) => {
          if (isLoading) {
            return <span>🔄</span>
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
              {row.isExpanded ? '🔽' : '▶️'}
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
  );

  const data = React.useMemo(() => makeData(20), []);

  const loadChildren = useCallback((parentRow) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(makeData(20));
      }, 2000);
    });
  }, []);

  // TODO: Need to pass drag rules, etc here...
  return (
    <Table columns={columns} data={data} loadChildren={loadChildren} />
  );
}


// ======================================================

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
