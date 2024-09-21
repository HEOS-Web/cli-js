/**
 * @module heos-web/cli
 * @license
 * Copyright (c) 2024 Stefan Ensmann
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { createSocket } from "dgram";
import type { RoutingInfo } from "./util/types.js";
import ConnectionWithBrowseCommands from "./withBrowseCommands.js";

/**
 * The SSDP schema used by HEOS devices
 */
const heosSchemaName = 'urn:schemas-denon-com:device:ACT-Denon:1';

/**
 * The SSDP discovery address
 */
const ssdpIp = '239.255.255.250';

/**
 * The SSDP discovery port
 */
const ssdpPort = 1900;

/**
 * The TCP message for SSDP discovery
 */
const ssdpDiscoveryMessage = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${ssdpIp}:${ssdpPort}`,
  `ST: ${heosSchemaName}`,
  'MX: 5',
  'MAN: "ssdp:discover"',
  '\r\n'
].join('\r\n');

/**
 * Discover HEOS compatible devices in the local network.
 * Stops after {@link timeout} milliseconds or when {@link maxDevices} have been found.
 *
 * @param timeout
 * Duration in milliseconds until this function timeouts.
 * 
 * @param maxDevices
 * Maximum number of devices to discover.
 * 
 * @param onDiscover
 * The callback to execute every time a new device is discovered.
 * 
 * @param onTimeout
 * The callback to execute when the process times out and is not terminated early by discovering {@link maxDevices}.
 * 
 * @returns A promise for the discovery process. Resolves, if at least one device is found, rejects otherwise.
 * 
 * @author Stefan Ensmann <stefan@ensmann.de>
 */
export function discoverDevices(
  maxDevices: number = Number.MAX_VALUE,
  timeout: number = 5000,
  onDiscover?: (device: RoutingInfo) => void,
  onTimeout?: (devices: RoutingInfo[]) => void
): Promise<RoutingInfo[]> {
  return new Promise<RoutingInfo[]>((resolve, reject) => {
    const devices: RoutingInfo[] = [];
    const timeoutReference = setTimeout(stopDiscovery, timeout);
    const socket = createSocket('udp4');

    function stopDiscovery(early: boolean = false) {
      socket.close();
      clearTimeout(timeoutReference);
      if (!early && onTimeout) {
        onTimeout(devices);
      }
      devices.length > 0 ? resolve(devices) : reject('No devices found!');
    }

    socket
      .bind()
      .on('listening', () => {
        socket.send(ssdpDiscoveryMessage, ssdpPort, ssdpIp);
      })
      .on('message', (msg: string, routingInfo: RoutingInfo) => {
        if (!msg.includes(heosSchemaName)) {
          return;
        }

        devices.push(routingInfo);
        if (onDiscover) {
          onDiscover(routingInfo);
        }
        if (maxDevices && devices.length >= maxDevices) {
          stopDiscovery(true);
        }
      });
  });
}

/**
 * Contains all information and functions for handling a connection to a HEOS device.
 * 
 * @author Stefan Ensmann <stefan@ensmann.de>
 */
export class Connection extends ConnectionWithBrowseCommands {
  /**
   * This constructor is not meant to be called externally
   * 
   * @param device The HEOS device to connect to
   */
  private constructor(device: RoutingInfo) {
    super(device);
  }

  /**
   * Tries to discover HEOS devices and connects to the first device found
   * 
   * @returns A promise for the connection process
   */
  static async discoverAndConnect(): Promise<Connection> {
    const devices = await discoverDevices(1);
    return await Connection.toDevice(devices[0]);
  }

  /**
   * Establishes a connection to the given HEOS device
   * 
   * @param device The device to connect to
   * 
   * @returns A promise for the connection process
   */
  static async toDevice(device: RoutingInfo): Promise<Connection> {
    const connection = new Connection(device);
    await connection.initSockets(connection.handleCommandData, connection.handleEventData);
    return connection;
  }
}
