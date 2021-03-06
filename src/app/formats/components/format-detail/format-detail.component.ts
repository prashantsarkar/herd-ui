/*
* Copyright 2018 herd-ui contributors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import { Component, Inject, OnInit, ViewEncapsulation } from '@angular/core';
import { default as AppIcons } from '../../../shared/utils/app-icons';
import { Action } from '../../../shared/components/side-action/side-action.component';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BusinessObjectFormat, BusinessObjectFormatService, Namespace, BusinessObjectDataService,
  BusinessObjectDefinitionColumnService, BusinessObjectDataAvailabilityRequest, StorageService
} from '@herd/angular-client';
import { Observable } from 'rxjs/Observable';
import { AlertService, DangerAlert } from 'app/core/services/alert.service';
import { map, startWith, flatMap } from 'rxjs/operators';

@Component({
  selector: 'sd-format-detail',
  templateUrl: './format-detail.component.html',
  styleUrls: ['./format-detail.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class FormatDetailComponent implements OnInit {
  sideActions;

  namespace;
  businessObjectDefinitionName;
  businessObjectFormatUsage;
  businessObjectFormatFileType;
  businessObjectFormatVersion;
  businessObjectFormatDetail: any;
  businessObjectDefinitionColumns: any;
  minPrimaryPartitionValue: any;
  maxPrimaryPartitionValue: any;
  formatVersions: Observable<number[]>;
  private errorMessageNotFound = 'No data registered';
  private errorMessageAuthorization = 'Access Denied';
  private currentUrl: string;

  constructor(
    private activatedRoute: ActivatedRoute,
    private businessObjectFormatApi: BusinessObjectFormatService,
    private businessObjectDefinitionColumnApi: BusinessObjectDefinitionColumnService,
    private businessObjectDataApi: BusinessObjectDataService,
    private storageApi: StorageService,
    private alerter: AlertService,
    private router: Router
  ) {
  }

  ngOnInit() {
    this.activatedRoute.params.subscribe((param) => {
      this.namespace = param['namespace'];
      this.businessObjectDefinitionName = param['dataEntityname'];
      this.businessObjectFormatUsage = param['formatUsage'];
      this.businessObjectFormatFileType = param['formatFileType'];
      this.businessObjectFormatVersion = parseInt(param['formatVersion'], 10);

      // used to fill in all of the versions for the select
      this.formatVersions = this.businessObjectFormatApi
        .businessObjectFormatGetBusinessObjectFormats(this.namespace, this.businessObjectDefinitionName, false).pipe(
        map((resp) => {
          return resp.businessObjectFormatKeys.filter((key) => {
            return key.businessObjectFormatUsage === this.businessObjectFormatUsage
              && key.businessObjectFormatFileType === this.businessObjectFormatFileType;
          }).map((key) => {
            return key.businessObjectFormatVersion;
          }).sort((a, b) => {
            return a - b;
          });
        }),
        startWith([])); // use starts with to get rid of template parsing errors using async pipe

      this.businessObjectFormatApi
        .businessObjectFormatGetBusinessObjectFormat(this.namespace,
        this.businessObjectDefinitionName,
        this.businessObjectFormatUsage,
        this.businessObjectFormatFileType,
        this.businessObjectFormatVersion)
        .subscribe((bFormatResponse) => {
          this.businessObjectFormatDetail = bFormatResponse;
          this.businessObjectDefinitionColumnApi
            .businessObjectDefinitionColumnGetBusinessObjectDefinitionColumns(this.namespace, this.businessObjectDefinitionName)
            .subscribe((response) => {
              this.businessObjectDefinitionColumns = response.businessObjectDefinitionColumnKeys;
              for (const businessObjectDefinitionColumn of this.businessObjectDefinitionColumns) {
                this.businessObjectDefinitionColumnApi
                  .businessObjectDefinitionColumnGetBusinessObjectDefinitionColumn(
                  businessObjectDefinitionColumn.namespace,
                  businessObjectDefinitionColumn.businessObjectDefinitionName,
                  businessObjectDefinitionColumn.businessObjectDefinitionColumnName
                  ).subscribe((resp) => {
                    businessObjectDefinitionColumn.schemaColumnName = resp.schemaColumnName;
                    businessObjectDefinitionColumn.description = resp.description;
                    if (this.businessObjectFormatDetail.schema && this.businessObjectFormatDetail.schema.columns) {
                      for (const col of this.businessObjectFormatDetail.schema.columns) {
                        if (businessObjectDefinitionColumn.schemaColumnName === col.name) {
                          col.bDefColumnDescription = businessObjectDefinitionColumn.description;
                        }
                      }
                    }

                  });
              }

            });
        });

      // setting the min and max partition value
      this.getMinAndMaxPartitionValues();
    });

    this.populateSideActions();
  }

  switchVersions(select) {
    const version = select.value;
    select.value = this.businessObjectFormatVersion; // revert to previous value for saved state.
    this.router.navigate(['/formats', this.namespace,
      this.businessObjectDefinitionName,
      this.businessObjectFormatUsage,
      this.businessObjectFormatFileType, version]);
  }

  private getMinAndMaxPartitionValues() {
    const request: BusinessObjectDataAvailabilityRequest = {
      namespace: this.namespace,
      businessObjectDefinitionName: this.businessObjectDefinitionName,
      businessObjectFormatUsage: this.businessObjectFormatUsage,
      businessObjectFormatFileType: this.businessObjectFormatFileType,
      businessObjectFormatVersion: this.businessObjectFormatVersion,
      partitionValueFilter: {
        partitionValues: [
          '${minimum.partition.value}',
          '${maximum.partition.value}'
        ]
      }
    }

    // to get the absolute possible maximum and minimum values
    // we hve to search accross all storage names for the request.
    // so first get all storage names and then make the request for each.

    this.businessObjectDataApi.defaultHeaders.append('skipAlert', 'true');
    this.storageApi.defaultHeaders.append('skipAlert', 'true');
    this.storageApi.storageGetStorages().pipe(
      flatMap((resp) => {
      request.storageNames = resp.storageKeys.map((key) => {
        return key.storageName;
      });
      return this.businessObjectDataApi
        .businessObjectDataCheckBusinessObjectDataAvailability(request)
    })).finally(() => {
      this.businessObjectDataApi.defaultHeaders.delete('skipAlert');
      this.storageApi.defaultHeaders.delete('skipAlert');
    }).subscribe(
      (response) => {
        if (response.availableStatuses.length) {
          this.minPrimaryPartitionValue = response.availableStatuses[0].partitionValue;
          this.maxPrimaryPartitionValue = response.availableStatuses[1].partitionValue;
        }
      },
      (error) => {
        // Check for 400 error to change to polite error message
        if (error.status === 404 || error.status === 403) {
          if (error.status === 403) {
            this.minPrimaryPartitionValue = this.errorMessageAuthorization;
            this.maxPrimaryPartitionValue = this.errorMessageAuthorization;
          } else {
            this.minPrimaryPartitionValue = this.errorMessageNotFound;
            this.maxPrimaryPartitionValue = this.errorMessageNotFound;
          }
        } else if (error.url) {
          // be sure to show other errors if they occur.
          this.alerter.alert(new DangerAlert('HTTP Error: ' + error.status + ' ' + error.statusText,
                        'URL: ' + error.url, 'Info: ' + error.json().message));
        }
      });
  }

  /*
   * Populate the side actions
   *
   */
  private populateSideActions() {
    this.sideActions = [
      new Action(AppIcons.shareIcon, 'Share'),
      new Action(AppIcons.saveIcon, 'Save'),
      new Action(AppIcons.watchIcon, 'Watch')
    ]
  }

}
