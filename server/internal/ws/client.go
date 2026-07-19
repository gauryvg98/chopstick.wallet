package ws

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	subs        map[string]bool // price subs; touched only by readPump
	candleSubs  map[string]bool // "mint|tf" candle subs; touched only by readPump
	tradeSubs   map[string]bool // mint trade subs; touched only by readPump
	discoverSub bool
}

type inbound struct {
	Type  string   `json:"type"` // "sub" | "unsub" | "sub_candles" | "unsub_candles"
	Mints []string `json:"mints"`
	Mint  string   `json:"mint"`
	Tf    string   `json:"tf"`
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(8192)
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var m inbound
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.Type {
		case "sub":
			var fresh []string
			for _, mint := range m.Mints {
				if mint != "" && !c.subs[mint] {
					c.subs[mint] = true
					fresh = append(fresh, mint)
				}
			}
			if len(fresh) > 0 {
				// addSubs registers the per-mint fan-out AND sends an instant
				// first-paint snapshot from last-known prices.
				c.hub.addSubs(c, fresh)
			}
		case "unsub":
			var gone []string
			for _, mint := range m.Mints {
				if c.subs[mint] {
					delete(c.subs, mint)
					gone = append(gone, mint)
				}
			}
			if len(gone) > 0 {
				c.hub.delSubs(c, gone)
			}
		case "sub_candles":
			if m.Mint == "" || m.Tf == "" {
				continue
			}
			key := m.Mint + "|" + m.Tf
			if !c.candleSubs[key] {
				c.candleSubs[key] = true
				c.hub.addCandleSub(c, m.Mint, m.Tf)
			}
		case "unsub_candles":
			key := m.Mint + "|" + m.Tf
			if c.candleSubs[key] {
				delete(c.candleSubs, key)
				c.hub.delCandleSub(c, m.Mint, m.Tf)
			}
		case "sub_discover":
			if !c.discoverSub {
				c.discoverSub = true
				c.hub.addDiscoverSub(c)
			}
		case "unsub_discover":
			if c.discoverSub {
				c.discoverSub = false
				c.hub.delDiscoverSub(c)
			}
		case "sub_trades":
			if m.Mint != "" && !c.tradeSubs[m.Mint] {
				c.tradeSubs[m.Mint] = true
				c.hub.addTradeSub(c, m.Mint)
			}
		case "unsub_trades":
			if c.tradeSubs[m.Mint] {
				delete(c.tradeSubs, m.Mint)
				c.hub.delTradeSub(c, m.Mint)
			}
		}
	}
}

func (c *Client) writePump() {
	ping := time.NewTicker(30 * time.Second)
	defer func() {
		ping.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ping.C:
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
